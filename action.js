const core = require('@actions/core');
const command = require('@actions/core/lib/command');
const got = require('got');

async function exportSecrets() {
    const vaultUrl = core.getInput('url', { required: true });
    const vaultToken = core.getInput('token', { required: true });
    const vaultNamespace = core.getInput('namespace', { required: false });
    const skipTlsVerification = core.getInput('skip_tls_verification', { required: false });

    const secretsInput = core.getInput('secrets', { required: true });
    const secrets = parseSecretsInput(secretsInput);

    for (const secret of secrets) {
        const { secretPath, outputName, secretKey } = secret;
        const requestOptions = {
            rejectUnauthorized: false,
            headers: {
                'X-Vault-Token': vaultToken
            }};

        if (vaultNamespace != null){
            requestOptions.headers["X-Vault-Namespace"] = vaultNamespace
        }

        const result = await got(`${vaultUrl}/v1/secret/data/${secretPath}`, requestOptions);

        const parsedResponse = JSON.parse(result.body);
        const vaultKeyData = parsedResponse.data;
        const versionData = vaultKeyData.data;
        const value = versionData[secretKey];
        command.issue('add-mask', value);
        core.exportVariable(outputName, `${value}`);
        core.debug(`✔ ${secretPath} => ${outputName}`);
    }
};

/**
 * Parses a secrets input string into key paths and their resulting environment variable name.
 * @param {string} secretsInput 
 */
function parseSecretsInput(secretsInput) {
    const secrets = secretsInput
        .split(';')
        .filter(key => !!key)
        .map(key => key.trim())
        .filter(key => key.length !== 0);

    /** @type {{ secretPath: string; outputName: string; dataKey: string; }[]} */
    const output = [];
    for (const secret of secrets) {
        let path = secret;
        let outputName = null;

        const renameSigilIndex = secret.lastIndexOf('|');
        if (renameSigilIndex > -1) {
            path = secret.substring(0, renameSigilIndex).trim();
            outputName = secret.substring(renameSigilIndex + 1).trim();

            if (outputName.length < 1) {
                throw Error(`You must provide a value when mapping a secret to a name. Input: "${secret}"`);
            }
        }

        const pathParts = path
            .split(/\s+/)
            .map(part => part.trim())
            .filter(part => part.length !== 0);

        if (pathParts.length !== 2) {
            throw Error(`You must provide a valid path and key. Input: "${secret}"`)
        }

        const [secretPath, secretKey] = pathParts;

        // If we're not using a mapped name, normalize the key path into a variable name.
        if (!outputName) {
            outputName = normalizeOutputKey(secretKey);
        }

        output.push({
            secretPath,
            outputName,
            secretKey
        });
    }
    return output;
}

/**
 * Replaces any forward-slash characters to 
 * @param {string} dataKey
 */
function normalizeOutputKey(dataKey) {
    return dataKey.replace('/', '__').replace(/[^\w-]/, '').toUpperCase();
}

module.exports = {
    exportSecrets,
    parseSecretsInput,
    normalizeOutputKey
};
