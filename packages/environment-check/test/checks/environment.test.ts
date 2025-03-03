import type { CheckEnvironmentOptions, Destination } from '../../src';
import { checkEnvironment, getEnvironment } from '../../src/checks/environment';
import { checkBASDestinations, needsUsernamePassword, checkBASDestination } from '../../src/checks/destination';
import { DevelopmentEnvironment, Severity } from '../../src/types';
import { isAppStudio } from '@sap-ux/btp-utils';
import { join } from 'path';
import * as install from '../../src/checks/get-installed';

jest.mock('axios');

jest.mock('@sap-ux/btp-utils', () => ({
    isAppStudio: jest.fn(),
    getAppStudioProxyURL: jest.fn()
}));
const mockIsAppStudio = isAppStudio as jest.Mock;

jest.mock('../../src/checks/destination', () => ({
    checkBASDestinations: jest.fn(),
    needsUsernamePassword: jest.fn(),
    checkBASDestination: jest.fn()
}));
const mockCheckBASDestinations = checkBASDestinations as jest.Mock;
const mockNeedsUsernamePassword = needsUsernamePassword as jest.Mock;
const mockCheckBASDestination = checkBASDestination as jest.Mock;

const nodeJSProcessVersions = {
    'node': '16.17.0',
    'v8': '9.4.146.26-node.22',
    'uv': '1.43.0',
    'zlib': '1.2.11',
    'ares': '1.18.1',
    'modules': '93',
    'openssl': '1.1.1q+quic',
    'http_parser': '1'
};
describe('Test for getEnvironmentCheck()', () => {
    test('Ensure correct dev environment (VSCode)', async () => {
        mockIsAppStudio.mockReturnValue(false);
        jest.spyOn(install, 'getFioriGenVersion').mockResolvedValueOnce('1');
        jest.spyOn(install, 'getCFCliToolVersion').mockResolvedValueOnce('2');
        jest.spyOn(install, 'getInstalledExtensions').mockResolvedValueOnce({});
        jest.spyOn(install, 'getProcessVersions').mockResolvedValueOnce(nodeJSProcessVersions);
        const { environment, messages } = await getEnvironment();
        expect(environment.developmentEnvironment === DevelopmentEnvironment.VSCode).toBeTruthy();
        expect(messages.length).toBeGreaterThan(0);
    });

    test('Ensure correct dev environment (BAS)', async () => {
        mockIsAppStudio.mockReturnValue(true);
        jest.spyOn(install, 'getFioriGenVersion').mockResolvedValueOnce('1');
        jest.spyOn(install, 'getCFCliToolVersion').mockResolvedValueOnce('2');
        jest.spyOn(install, 'getInstalledExtensions').mockResolvedValueOnce({});
        jest.spyOn(install, 'getProcessVersions').mockResolvedValueOnce(nodeJSProcessVersions);
        const { environment, messages } = await getEnvironment();
        expect(environment.developmentEnvironment === DevelopmentEnvironment.BAS).toBeTruthy();
        expect(messages.length).toBeGreaterThan(0);
    });
});

describe('Test for checkEnvironment() (BAS)', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockIsAppStudio.mockReturnValue(true);
        jest.spyOn(install, 'getFioriGenVersion').mockResolvedValueOnce('1');
        jest.spyOn(install, 'getCFCliToolVersion').mockResolvedValueOnce('2');
        jest.spyOn(install, 'getInstalledExtensions').mockResolvedValueOnce({});
        jest.spyOn(install, 'getProcessVersions').mockResolvedValueOnce(nodeJSProcessVersions);
    });

    test('Destinations that need authentication and no credentials are supplied, getEnvironmentCheck()', async () => {
        const data = [
            {
                Name: 'ONE',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'Internet',
                Description: 'ONE_DESC',
                WebIDEUsage: 'odata_abap',
                Host: 'https://one.dest:123'
            },
            {
                Name: 'TWO',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'OnPremise',
                Description: 'TWO_DESC',
                'sap-client': '111',
                WebIDEUsage: 'odata_abap,dev_abap',
                Host: 'http://two.dest:234',
                WebIDEExposedHost: 'http://two.dest:345'
            }
        ];
        mockCheckBASDestinations.mockImplementationOnce(() => Promise.resolve({ messages: [], destinations: data }));
        mockCheckBASDestination.mockImplementationOnce(() =>
            Promise.resolve({
                messages: [],
                destinationResults: {
                    v2: {},
                    v4: {},
                    HTML5DynamicDestination: 'true'
                }
            })
        );
        mockNeedsUsernamePassword.mockReturnValueOnce(true);

        const options: CheckEnvironmentOptions = {
            workspaceRoots: [join(__dirname, '..', 'sample-workspace')],
            destinations: ['ONE']
        };

        // Test execution
        const result = await checkEnvironment(options);
        const warningMessage = result.messages?.find(
            (m) => m.text.includes('requires username/password') && m.severity === Severity.Warning
        );

        // Result check
        expect(result.destinations).toEqual(data);
        expect(result.messages).toBeDefined();
        expect(warningMessage).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.destinationResults).toBeDefined();
    });
    test('Destinations that need authentication and credentials are supplied, getEnvironmentCheck()', async () => {
        const data = [
            {
                Name: 'ONE',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'Internet',
                'HTML5.DynamicDestination': 'true',
                Description: 'ONE_DESC',
                WebIDEUsage: 'odata_abap',
                Host: 'https://one.dest:123'
            },
            {
                Name: 'TEST_DEST_B1',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'OnPremise',
                'HTML5.DynamicDestination': 'true',
                Description: 'TWO_DESC',
                WebIDEUsage: 'odata_abap,dev_abap',
                Host: 'http://two.dest:234',
                WebIDEExposedHost: 'http://two.dest:345'
            },
            {
                Name: 'TEST_DEST_A',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'OnPremise',
                'HTML5.DynamicDestination': 'true',
                Description: 'TWO_DESC',
                WebIDEUsage: 'odata_abap,dev_abap',
                Host: 'http://two.dest:234',
                WebIDEExposedHost: 'http://two.dest:345'
            },
            {
                Name: 'TEST_DEST_B2',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'OnPremise',
                'HTML5.DynamicDestination': 'true',
                Description: 'TWO_DESC',
                WebIDEUsage: 'odata_abap,dev_abap',
                Host: 'http://two.dest:234',
                WebIDEExposedHost: 'http://two.dest:345'
            }
        ];
        const v2catalogResponse = {
            status: 200,
            data: {
                d: {
                    results: ['V2_S1', 'V2_S2', 'V2_S3']
                }
            }
        };
        const v4catalogResponse = {
            status: 200,
            data: {
                value: [
                    { DefaultSystem: { Services: ['V4_S1'] } },
                    { DefaultSystem: { Services: ['V4_S2'] } },
                    { DefaultSystem: { Services: ['V4_S3'] } }
                ]
            }
        };
        mockCheckBASDestinations.mockImplementationOnce(() => Promise.resolve({ messages: [], destinations: data }));

        mockCheckBASDestination.mockImplementation(() =>
            Promise.resolve({
                messages: [],
                destinationResults: {
                    v2: v2catalogResponse,
                    v4: v4catalogResponse,
                    HTML5DynamicDestination: 'true'
                }
            })
        );
        mockNeedsUsernamePassword.mockReturnValueOnce(true);

        const mockCredentialCallback = jest
            .fn()
            .mockImplementation((destination: Destination) =>
                Promise.resolve({ username: destination.Name + 'USER', password: 'pwd' })
            );
        const options: CheckEnvironmentOptions = {
            workspaceRoots: [join(__dirname, '..', 'sample-workspace')],
            destinations: ['ONE'],
            credentialCallback: mockCredentialCallback
        };
        // Test execution
        const result = await checkEnvironment(options);

        // Result check
        expect(mockCredentialCallback).toBeCalledWith(data[0]);
        expect(result.destinations).toEqual(data);
        expect(result.messages).toBeDefined();
        expect(result.messages.find((m) => m.severity >= Severity.Warning)).toBeUndefined();
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.destinationResults).toBeDefined();
    });

    test('Destinations that does not need authentication, getEnvironmentCheck()', async () => {
        const data = [
            {
                Name: 'EC1_NOAUTH',
                Type: 'HTTP',
                Authentication: 'BasicAuthentication',
                ProxyType: 'OnPremise',
                Description: 'EC1',
                'sap-client': '100',
                WebIDEUsage: 'odata_abap',
                Host: 'http://ccwdfgl9773.devint.net.sap:50000'
            }
        ];
        mockCheckBASDestinations.mockImplementationOnce(() => Promise.resolve({ messages: [], destinations: data }));
        mockCheckBASDestination.mockImplementationOnce(() =>
            Promise.resolve({
                messages: [],
                destinationResults: {
                    v2: {},
                    v4: {},
                    HTML5DynamicDestination: 'true'
                }
            })
        );
        mockNeedsUsernamePassword.mockReturnValueOnce(false);

        const options: CheckEnvironmentOptions = {
            workspaceRoots: [join(__dirname, '..', 'sample-workspace')],
            destinations: [data[0].Name]
        };

        // Test execution
        const result = await checkEnvironment(options);

        // Result check
        expect(result.destinations).toEqual(data);
        expect(result.messages).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.destinationResults).toBeDefined();
    });
    test('No deep dive destination, getEnvironmentCheck()', async () => {
        const data = [
            {
                Name: 'ONE',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'Internet',
                Description: 'ONE_DESC',
                WebIDEUsage: 'odata_abap',
                Host: 'https://one.dest:123'
            }
        ];
        mockCheckBASDestinations.mockImplementationOnce(() => Promise.resolve({ messages: [], destinations: data }));
        mockCheckBASDestination.mockImplementationOnce(() =>
            Promise.resolve({
                messages: [],
                destinationResults: {
                    v2: {},
                    v4: {},
                    HTML5DynamicDestination: 'true'
                }
            })
        );
        mockNeedsUsernamePassword.mockReturnValueOnce(false);

        const options: CheckEnvironmentOptions = {
            workspaceRoots: ['test/workspace']
        };

        // Test execution
        const result = await checkEnvironment(options);
        const warningMessage = result.messages?.find(
            (m) => m.text.includes('No destinations details requested') && m.severity === Severity.Info
        );

        // Result check
        expect(warningMessage).toBeDefined();
        expect(result.destinations).toEqual(data);
        expect(result.messages).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.destinationResults).toBeDefined();
    });
    test('Checking for deep dive destination that does not exist in the list, getEnvironmentCheck()', async () => {
        const data = [
            {
                Name: 'ONE',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'Internet',
                Description: 'ONE_DESC',
                WebIDEUsage: 'odata_abap',
                Host: 'https://one.dest:123'
            }
        ];
        mockCheckBASDestinations.mockImplementationOnce(() => Promise.resolve({ messages: [], destinations: data }));
        mockCheckBASDestination.mockImplementationOnce(() =>
            Promise.resolve({
                messages: [],
                destinationResults: {
                    v2: {},
                    v4: {},
                    HTML5DynamicDestination: 'true'
                }
            })
        );
        mockNeedsUsernamePassword.mockReturnValueOnce(false);

        const options: CheckEnvironmentOptions = {
            workspaceRoots: [join(__dirname, '..', 'sample-workspace')],
            destinations: ['NotInList']
        };

        // Test execution
        const result = await checkEnvironment(options);
        const warningMessage = result.messages?.find(
            (m) => m.text.includes(`Couldn't find destination`) && m.severity === Severity.Warning
        );

        // Result check
        expect(warningMessage).toBeDefined();
        expect(result.destinations).toEqual(data);
        expect(result.messages).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.destinationResults).toBeDefined();
    });
    test('credentialCallBack is defined but no username and/or password is supplied while it is required, getEnvironmentCheck()', async () => {
        const data = [
            {
                Name: 'ONE',
                Type: 'HTTP',
                Authentication: 'NoAuthentication',
                ProxyType: 'Internet',
                Description: 'ONE_DESC',
                WebIDEUsage: 'odata_abap',
                Host: 'https://one.dest:123'
            }
        ];
        mockCheckBASDestinations.mockImplementationOnce(() => Promise.resolve({ messages: [], destinations: data }));
        mockCheckBASDestination.mockImplementationOnce(() =>
            Promise.resolve({
                messages: [],
                destinationResults: {
                    v2: {},
                    v4: {},
                    HTML5DynamicDestination: 'true'
                }
            })
        );
        mockNeedsUsernamePassword.mockReturnValueOnce(true);

        const mockCredentialCallback = jest.fn().mockImplementation(() => Promise.resolve({}));
        const options: CheckEnvironmentOptions = {
            workspaceRoots: [join(__dirname, '..', 'sample-workspace')],
            destinations: [data[0].Name],
            credentialCallback: mockCredentialCallback
        };

        // Test execution
        const result = await checkEnvironment(options);

        // Result check
        expect(result.destinations).toEqual(data);
        expect(result.messages).toBeDefined();
        expect(result.messages.length).toBeGreaterThan(0);
        expect(result.destinationResults).toBeDefined();
    });
});

describe('Test for checkEnvironment() (VSCODE)', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        mockIsAppStudio.mockReturnValue(false);
    });
    test('Testing getToolsExtensions', async () => {
        const extensionVersions = {
            'yeoman-ui': { version: '2' },
            'vscode-ui5-language-assistant': { version: '2' },
            'xml-toolkit': { version: '2' },
            'sap-ux-annotation-modeler-extension': { version: '2.2' },
            'sap-ux-application-modeler-extension': { version: '2' },
            'sap-ux-help-extension': { version: '2' },
            'sap-ux-service-modeler-extension': { version: '2.4' },
            'vscode-cds': { version: '2' }
        };

        const expectedData = {
            fioriGenVersion: '1',
            cloudCli: '2',
            appWizard: '2',
            ui5LanguageAssistant: '2',
            xmlToolkit: '2',
            annotationMod: '2.2',
            appMod: '2',
            help: '2',
            serviceMod: '2.4',
            cds: '2'
        };

        jest.spyOn(install, 'getFioriGenVersion').mockResolvedValueOnce('1');
        jest.spyOn(install, 'getCFCliToolVersion').mockResolvedValueOnce('2');
        jest.spyOn(install, 'getInstalledExtensions').mockResolvedValueOnce(extensionVersions);
        jest.spyOn(install, 'getProcessVersions').mockResolvedValueOnce(nodeJSProcessVersions);
        // Test execution
        const result = await checkEnvironment();
        expect(result.environment?.toolsExtensions).toEqual(expectedData);
    });

    test('Testing getToolsExtensions (no extensions installed)', async () => {
        const expectedData = {
            fioriGenVersion: '1',
            cloudCli: '2',
            appWizard: 'Not installed',
            ui5LanguageAssistant: 'Not installed',
            xmlToolkit: 'Not installed',
            annotationMod: 'Not installed',
            appMod: 'Not installed',
            help: 'Not installed',
            serviceMod: 'Not installed',
            cds: 'Not installed'
        };

        jest.spyOn(install, 'getFioriGenVersion').mockResolvedValueOnce('1');
        jest.spyOn(install, 'getCFCliToolVersion').mockResolvedValueOnce('2');
        jest.spyOn(install, 'getInstalledExtensions').mockResolvedValueOnce({});
        jest.spyOn(install, 'getProcessVersions').mockResolvedValueOnce(nodeJSProcessVersions);
        // Test execution
        const result = await checkEnvironment();
        expect(result.environment?.toolsExtensions).toEqual(expectedData);
    });
});
