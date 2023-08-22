const RestClient = require('./restClient.js')


/**
 * Jira basic API wrapper
 */
class JiraClient extends RestClient {

    /**
     * Jira constructor
     *
     * @param options
     */
    constructor(options) {
        super();
        this._validate(options, 'domain');
        this._validate(options, 'apiToken');

        this.options = options;
        this.base = `https://${this.options.domain}/rest/api/2/`;
        this.headers = {
            "Authorization": `Basic ${this.options.apiToken}`,
            "Content-Type": "application/json; charset=utf-8"
        }
        this.apiCache = new Map(); // Створюємо мапу для кешування результатів API викликів
    }

    /**
     * Gets issue id Jira via API
     * @param issueKey
     * @return issueId
     */
    async getIssueIdByKey(issueKeys) {
        let result = [];

        if (issueKeys) {
            for (let i in issueKeys) {
                let issueKey = issueKeys[i];
                let cachedResponse = this.apiCache.get(`getIssueIdByKey:${issueKey}`);

                if (cachedResponse) {
                    result.push(cachedResponse);
                } else {
                    let response = await this._get(`issue/${issueKey}`);
                    let issueId = response['id'];
                    result.push(issueId);
                    this.apiCache.set(`getIssueIdByKey:${issueKey}`, issueId); // Зберігаємо результат у кеші
                }
            }
        }

        return result;
    }


}

module.exports = JiraClient;
