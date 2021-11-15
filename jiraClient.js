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

    }

    /**
     * Gets issue id Jira via API
     * @param issueKey
     * @return issueId
     */
    getIssueIdByKey(issueKeys) {
        let result = []
        if (issueKeys) {
            for (let i in issueKeys){
            let response = this._get(`issue/${issueKeys[i]}`)
            result.push(response['id'])
        }}
        return result
    }


}

module.exports = JiraClient;
