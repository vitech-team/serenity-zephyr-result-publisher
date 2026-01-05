const axios = require("axios");
const https = require("https");

/**
 * Rest client
 */
class RestClient {

    constructor() {
        this.headers = {}

    }


    /**
     * Validate config values
     *
     * @param options
     * @param name
     * @private
     */
    _validate(options, name) {
        if (options == null) {
            throw new Error("Missing Zephyr Scale options");
        }
        if (options[name] == null) {
            throw new Error(`Missing ${name} value. Please update Zephyr Scale option in environment variables`);
        }
    }

    /**
     * Form the url for api
     *
     * @param path
     * @returns {string}
     * @private
     */
    _url(path) {
        return `${this.base}${path}`;
    }

    /**
     * Post request formation
     *
     * @param api
     * @param body
     * @param error
     * @returns {*}
     * @private
     */
    _post(api, body, error = undefined, headers = this.headers) {
        return this._request("POST", api, body, error, headers);
    }

    /**
     * Post request formation
     *
     * @param api
     * @param body
     * @param error
     * @returns {*}
     * @private
     */
    _put(api, body, error = undefined) {
        return this._request("PUT", api, body, error);
    }

    /**
     * get request formation
     *
     * @param api
     * @param error
     * @returns {*}
     * @private
     */
    _get(api, error = undefined) {
        return this._request("GET", api);
    }

    /**
     * Patch request formation
     *
     * @param api
     * @param error
     * @returns {*}
     * @private
     */
    _patch(api, error = undefined) {
        return this._request("PATCH", api);
    }

    /**
     * Api request sending to the corresponding url
     *
     * @param method
     * @param api
     * @param body
     * @param error
     * @returns {*}
     * @private
     */
    async _request(method, api, body = undefined, error = undefined, headers = this.headers) {
        let count = 0;
        let maxTries = process.env.MAX_RETRY || 3;
        try {
            let result = await fetchWithRetry({
                method: method,
                    url: this._url(api),
                    headers: headers,
                    data: body
            }).catch((error) => {

                const status = error.response?.status || 'unknown';
                const statusText = error.response?.statusText || '';
                const errorMessage = error.response?.data?.message || error.message || '';
                const url = error.config?.url || this._url(api);
                const requestBody = error.config?.data || body;

                console.error(`\n❌ Request failed: ${method} ${url}`);
                console.error(`   Status: ${status} ${statusText}`);
                if (errorMessage) {
                    console.error(`   Message: ${errorMessage}`);
                }
                if (requestBody) {
                    console.error(`   Request body: ${typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)}`);
                }

                throw error;
            });
            await console.log(`Request: ${method} ${this._url(api)} ${result.status}`);
            return result.data;
        } catch (error) {
            if (++count === maxTries) throw {
                "method": method,
                "api": this._url(api),
                "body": body,
                "error": error
            };
        }
    }


}

module.exports = RestClient;
function delay(duration) {
    return new Promise(resolve => setTimeout(resolve, (++duration) * 1000));
}

async function fetchWithRetry(requests, maxRetries = 3) {
    axios.defaults.timeout = 30000;
    axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });
    let retries = 0;
    while (retries < maxRetries) {
        try {
            return await axios(requests);
        } catch (error) {
            const retryErrors = [429, 401, 503];
            if (error.response && retryErrors.includes(error.response.status)) {
                const retryAfter = error.response.headers['retry-after'] ?? 120;
                if (retryAfter && !isNaN(retryAfter)) {
                    await delay(Number(retryAfter));
                    retries++;
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
    }
    throw new Error('Max retries reached');
}
