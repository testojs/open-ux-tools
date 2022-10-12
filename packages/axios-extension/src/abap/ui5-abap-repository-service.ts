import type { AxiosResponse, AxiosRequestConfig, AxiosError } from 'axios';
import { prettyPrintError, prettyPrintMessage } from './message';
import { ODataService } from '../base/odata-service';

/**
 * Application information object returned by the UI5 Repository service
 */
export interface AppInfo {
    Name: string;
    Package: string;
    Description?: string;
    Info?: string;
    ZipArchive?: string;
}

/**
 * Required configuration to deploy an application using the UI5 Repository service.
 */
export interface ApplicationConfig {
    name: string;
    description?: string;
    package?: string;
    transport?: string;
}

export const abapUrlReplaceMap = new Map([
    [/\.abap\./, '.abap-web.'],
    [/-api\.s4hana\.ondemand\.com/, '.s4hana.ondemand.com'],
    [/-api\.saps4hanacloud\.cn/, '.saps4hanacloud.cn']
]);

const xmlReplaceMap = {
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
    '<': '&lt;',
    '>': '&gt;'
};
const xmlReplaceRegex = /[<>&"']/g;

/**
 * Escape invalid characters for XML values.
 *
 * @param xmlValue xml string
 * @returns escaped xml value
 */
function encodeXmlValue(xmlValue: string): string {
    return xmlValue.replace(xmlReplaceRegex, (c) => xmlReplaceMap[c]);
}

/**
 * Extension of the generic OData client simplifying the consumption of the UI5 repository service
 */
export class Ui5AbapRepositoryService extends ODataService {
    public static readonly PATH = '/sap/opu/odata/UI5/ABAP_REPOSITORY_SRV';

    /**
     * Get information about a deployed application. Returns undefined if the application cannot be found.
     *
     * @param app application id (BSP application name)
     * @returns application information or undefined
     */
    public async getInfo(app: string): Promise<AppInfo> {
        try {
            const response = await this.get<AppInfo>(`/Repositories('${encodeURIComponent(app)}')`);
            return response.odata();
        } catch (error) {
            return undefined;
        }
    }

    /**
     * Deploy the given archive either by creating a new BSP or updating an existing one.
     *
     * @param archive zip archive containing the application files as buffer
     * @param app application configuration
     * @param testMode if set to true, all requests will be sent, the service checks them, but no actual deployment will happen
     * @param safeMode if set then the SafeMode url parameter will be set. SafeMode is by default active, to activate provide false
     * @returns the Axios response object for futher processing
     */
    public async deploy(
        archive: Buffer,
        app: ApplicationConfig,
        testMode = false,
        safeMode?: boolean
    ): Promise<AxiosResponse> {
        const info: AppInfo = await this.getInfo(app.name);
        const payload = this.createPayload(
            archive,
            app.name,
            app.description || 'Deployed with SAP Fiori tools',
            info ? info.Package : app.package
        );
        const config = this.createConfig(app.transport, testMode, safeMode);
        const frontendUrl = this.getAbapFrontendUrl();
        try {
            const response: AxiosResponse | undefined = await this.updateRepoRequest(!!info, app.name, payload, config);
            // An app can be successfully deployed after a timeout exception, no value in showing exception headers
            if (response?.headers?.['sap-message']) {
                const message = JSON.parse(response.headers['sap-message']);
                prettyPrintMessage({ msg: message, log: this.log, host: frontendUrl });
            }
            // log url of created/updated app
            const path = '/sap/bc/ui5_ui5' + (!app.name.startsWith('/') ? '/sap/' : '') + app.name.toLowerCase();
            const query = this.defaults.params?.['sap-client']
                ? '?sap-client=' + this.defaults.params['sap-client']
                : '';
            this.log.info(`App available at ${frontendUrl}${path}${query}`);

            return response;
        } catch (error) {
            this.logError({ error, host: frontendUrl });
            throw error;
        }
    }

    /**
     * Undeploy an existing app.
     *
     * @param app application configuration
     * @param testMode if set to true, all requests will be sent, the service checks them, but no actual deployment will happen
     * @returns the Axios response object for futher processing
     */
    public async undeploy(app: ApplicationConfig, testMode = false): Promise<AxiosResponse> {
        const config = this.createConfig(app.transport, testMode);
        const host = this.getAbapFrontendUrl();
        try {
            const response = await this.deleteRepoRequest(app.name, config);
            if (response?.headers?.['sap-message']) {
                const message = JSON.parse(response.headers['sap-message']);
                prettyPrintMessage({ msg: message, log: this.log, host });
            }
            return response;
        } catch (error) {
            this.logError({ error, host });
            throw error;
        }
    }

    /**
     * Translate the technical ABAP on BTP URL to the frontend URL.
     *
     * @returns url to be used in the browser.
     */
    protected getAbapFrontendUrl(): string {
        const url = new URL(this.defaults.baseURL);
        abapUrlReplaceMap.forEach((value, key) => {
            url.hostname = url.hostname.replace(key, value);
        });
        return `${url.protocol}//${url.host}`;
    }

    /**
     * Internal helper method to generate a request configuration (headers, parameters).
     *
     * @param transport optional transport request id
     * @param testMode optional url parameter to enable test mode
     * @param safeMode optional url paramater to disable the safe model (safemode=false)
     * @returns the Axios response object for futher processing
     */
    protected createConfig(transport?: string, testMode?: boolean, safeMode?: boolean): AxiosRequestConfig {
        const headers = {
            'Content-Type': 'application/atom+xml',
            type: 'entry',
            charset: 'UTF8'
        };
        const params: { [key: string]: string | boolean } = {
            CodePage: "'UTF8'",
            CondenseMessagesInHttpResponseHeader: 'X',
            format: 'json'
        };
        if (transport) {
            params.TransportRequest = transport;
        }
        if (testMode) {
            params.TestMode = true;
        }
        if (safeMode !== undefined) {
            params.SafeMode = safeMode;
        }

        return { headers, params };
    }

    /**
     * Create the request payload for a deploy request.
     *
     * @param archive archive as buffer
     * @param name application name
     * @param description description for the deployed app
     * @param abapPackage ABAP package containing the app
     * @returns XML based request payload
     */
    protected createPayload(archive: Buffer, name: string, description: string, abapPackage: string): string {
        const base64Data = archive.toString('base64');
        const time = new Date().toISOString();
        const escapedName = encodeXmlValue(name);
        return (
            `<entry xmlns="http://www.w3.org/2005/Atom"` +
            `       xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata"` +
            `       xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices"` +
            `       xml:base="${this.defaults.baseURL}">` +
            `  <id>${this.defaults.baseURL}/Repositories('${escapedName}')</id>` +
            `  <title type="text">Repositories('${escapedName}')</title>` +
            `  <updated>${time}</updated>` +
            `  <category term="/UI5/ABAP_REPOSITORY_SRV.Repository" scheme="http://schemas.microsoft.com/ado/2007/08/dataservices/scheme"/>` +
            `  <link href="Repositories('${escapedName}')" rel="edit" title="Repository"/>` +
            `  <content type="application/xml">` +
            `    <m:properties>` +
            `      <d:Name>${escapedName}</d:Name>` +
            `      <d:Package>${abapPackage?.toUpperCase()}</d:Package>` +
            `      <d:Description>${encodeXmlValue(description)}</d:Description>` +
            `      <d:ZipArchive>${base64Data}</d:ZipArchive>` +
            `      <d:Info/>` +
            `    </m:properties>` +
            `  </content>` +
            `</entry>`
        );
    }

    /**
     * Send a request to the backed to create or update an application.
     *
     * @param isExisting app has already been deployed
     * @param appName application name
     * @param payload request payload
     * @param config additional request config
     * @param tryCount number of attempted deploys (sometimes a repo request fails with a known timeout issue, so we retry)
     * @returns the Axios response object for futher processing
     */
    protected async updateRepoRequest(
        isExisting: boolean,
        appName: string,
        payload: string,
        config: AxiosRequestConfig,
        tryCount = 1
    ): Promise<AxiosResponse | undefined> {
        try {
            // Was the app deployed after the first failed attempt?
            if (tryCount === 2) {
                this.log.warn(
                    'Warning: The application was deployed despite a time out response from the backend. Increasing the value of the HTML5.Timeout property for the destination may solve the issue'
                );
            }
            // If its already deployed, then dont try to create it again
            if (tryCount !== 1 && !isExisting && (await this.getInfo(appName)) !== undefined) {
                // We've nothing to return as we dont want to show the exception to the user!
                return Promise.resolve(undefined);
            } else {
                return isExisting
                    ? await this.put(`/Repositories('${encodeURIComponent(appName)}')`, payload, config)
                    : await this.post('/Repositories', payload, config);
            }
        } catch (error) {
            if (error?.response?.status === 504) {
                // Kill the flow after three attempts
                if (tryCount >= 3) {
                    throw error;
                }
                return this.updateRepoRequest(isExisting, appName, payload, config, tryCount + 1);
            } else {
                throw error;
            }
        }
    }

    /**
     * Send a request to the backed to delete an application.
     *
     * @param appName application name
     * @param config additional request config
     * @param tryCount number of attempted deploys (sometimes a repo request fails with a known timeout issue, so we retry)
     * @returns the Axios response object for futher processing
     */
    protected async deleteRepoRequest(
        appName: string,
        config: AxiosRequestConfig,
        tryCount = 1
    ): Promise<AxiosResponse> {
        try {
            if (tryCount === 2) {
                this.log.warn('Warning: retry undeploy to handle a backend rejection...');
            }
            return await this.delete(`/Repositories('${appName}')`, config);
        } catch (error) {
            if (error?.response?.status === 400) {
                // Kill the flow after 1 attempt
                if (tryCount >= 2) {
                    throw error;
                }
                return this.deleteRepoRequest(appName, config, tryCount + 1);
            } else {
                throw error;
            }
        }
    }

    /**
     * Log errors more user friendly if it is a standard Gateway error.
     *
     * @param e error thrown by Axios after sending a request
     * @param e.error error from Axios
     * @param e.host hostname
     */
    protected logError({ error, host }: { error: AxiosError; host?: string }): void {
        this.log.error(error.message);
        if (error.isAxiosError && error.response?.data?.['error']) {
            prettyPrintError({ error: error.response.data['error'], host, log: this.log });
        }
    }
}
