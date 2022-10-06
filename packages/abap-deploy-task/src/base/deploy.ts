import type {
    AbapServiceProvider,
    ProviderConfiguration,
    Ui5AbapRepositoryService,
    AxiosRequestConfig,
    AxiosError
} from '@sap-ux/axios-extension';
import {
    AbapCloudEnvironment,
    createForAbap,
    createForDestination,
    createForAbapOnCloud,
    isAxiosError
} from '@sap-ux/axios-extension';
import type { ServiceInfo } from '@sap-ux/btp-utils';
import { isAppStudio } from '@sap-ux/btp-utils';
import type { Logger } from '@sap-ux/logger';
import type { BackendSystem } from '@sap-ux/store';
import { getService, BackendSystemKey } from '@sap-ux/store';
import { writeFileSync } from 'fs';
import type { AbapDeployConfig, AbapTarget, CommonOptions } from '../types';
import { promptConfirmation, promptCredentials } from './prompt';

type BasicAuth = Required<Pick<BackendSystem, 'username' | 'password'>>;
type ServiceAuth = Required<Pick<BackendSystem, 'serviceKeys' | 'refreshToken'>>;

/**
 * Check the secure storage if it has credentials for the given target.
 *
 * @param target
 */
export async function getCredentials<T extends BasicAuth | ServiceAuth | undefined>(
    target: AbapTarget
): Promise<T | undefined> {
    if (!isAppStudio() && target.url) {
        const systemService = await getService<BackendSystem, BackendSystemKey>({ entityName: 'system' });
        let system = await systemService.read(new BackendSystemKey({ url: target.url, client: target.client }));
        if (!system && target.client) {
            // check if there are credentials for the default client
            system = await systemService.read(new BackendSystemKey({ url: target.url }));
        }
        return system as T;
    }
}

/**
 * Create an instance of a UI5AbapRepository service connected to the given target configuration.
 *
 * @param target - target system for the deployments
 * @param config
 * @returns service instance
 */
async function createDeployService(target: AbapTarget, config: CommonOptions): Promise<Ui5AbapRepositoryService> {
    let provider: AbapServiceProvider;
    const options: AxiosRequestConfig & Partial<ProviderConfiguration> = {};
    if (config.strictSsl === false) {
        options.ignoreCertErrors = true;
    }
    if (isAppStudio() && target.destination) {
        provider = createForDestination(options, {
            Name: target.destination
        }) as AbapServiceProvider;
    } else if (target.url) {
        if (target.scp) {
            const storedOpts = await getCredentials<ServiceAuth>(target);
            if (storedOpts) {
                provider = createForAbapOnCloud({
                    ...options,
                    environment: AbapCloudEnvironment.Standalone,
                    service: storedOpts.serviceKeys as ServiceInfo,
                    refreshToken: storedOpts.refreshToken
                });
            } else {
                throw new Error('TODO');
            }
        } else {
            options.baseURL = target.url;
            if (target.client) {
                options.params = { 'sap-client': target.client };
            }
            const storedOpts = await getCredentials<BasicAuth>(target);
            if (storedOpts?.password) {
                options.auth = {
                    username: storedOpts.username,
                    password: storedOpts.password
                };
            }
            provider = createForAbap(options);
        }
    } else {
        throw new Error('TODO');
    }
    return provider.getUi5AbapRepository();
}

/**
 * Deploy the given archive to the given target using the given app description.
 *
 * @param archive
 * @param config
 * @param logger - reference to the logger instance
 */
export async function deploy(archive: Buffer, config: AbapDeployConfig, logger: Logger) {
    if (config.keep) {
        writeFileSync(`archive-${Date.now()}.zip`, archive);
    }
    const service = await createDeployService(config.target, config);
    if (!config.strictSsl) {
        logger.warn(
            'You chose not to validate SSL certificate. Please verify the server certificate is trustful before proceeding. See documentation for recommended configuration (https://help.sap.com/viewer/17d50220bcd848aa854c9c182d65b699/Latest/en-US/4b318bede7eb4021a8be385c46c74045.html).'
        );
    }
    logger.info(`Starting deployment${config.test === true ? ' in test mode' : ''}.`);
    await tryDeploy(archive, service, config, logger);
    logger.info('Deployment successful.');
}

async function tryDeploy(archive: Buffer, service: Ui5AbapRepositoryService, config: AbapDeployConfig, logger: Logger) {
    try {
        await service.deploy(archive, config.app, config.test);
    } catch (e) {
        if (!config.noRetry && isAxiosError(e)) {
            const success = await handleAxiosError(e.response, archive, service, config, logger);
            if (success) {
                return;
            }
        }
        logger.error('Deployment has failed.');
        logger.debug(config);
        throw e;
    }
}

/**
 * Main function for different deploy retry handling.
 *
 * @param response - response of that trigged and axios error
 * @param archive - archive file that is to be deployed
 * @param service - instance of the axios-extension deployment service
 * @param config - configuration used for the previous request
 * @param logger - reference to the logger instance
 * @returns true if the error was handled otherwise false is return or an error is raised
 */
async function handleAxiosError(
    response: AxiosError['response'],
    archive: Buffer,
    service: Ui5AbapRepositoryService,
    config: AbapDeployConfig,
    logger: Logger
): Promise<boolean> {
    switch (response?.status) {
        case 401:
            logger.warn('Deployment failed with authentication error.');
            logger.info(
                'Please maintain correct credentials to avoid seeing this error\n\t(see help: https://www.npmjs.com/package/@sap/ux-ui5-tooling#setting-environment-variables-in-a-env-file)'
            );
            logger.info('Please enter your credentials for this deployment.');
            const credentials = await promptCredentials(service.defaults.auth?.username);
            if (credentials) {
                service.defaults.auth = credentials;
            } else {
                return false;
            }
            await tryDeploy(archive, service, config, logger);
            return true;
        case 412:
            logger.warn('An app in the same repository with different sap app id found.');
            if (config.yes || (await promptConfirmation('Do you want to overwrite (Y/n)?'))) {
                await tryDeploy(archive, service, { ...config, safe: false }, logger);
                return true;
            } else {
                return false;
            }
        default:
            return false;
    }
}
