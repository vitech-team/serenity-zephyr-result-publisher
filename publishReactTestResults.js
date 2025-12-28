const fs = require('fs')
const BasePublisher = require('./basePublisher.js')


class PublishReactTestResults extends BasePublisher {
    constructor() {
        super();
    }

    status = {
        'passed': 'pass',
        'failed': 'fail'
    };

    readReactTestResults(filePath = process.env.JSON_INPUT_PATH) {
        return JSON.parse(fs.readFileSync(filePath))
    }

    extractJiraKey(title) {
        const regex = /\[ED-(\d{1,6})]/;
        const match = title.match(regex);
        return match ? `ED-${match[1]}` : null;
    }

    cleanTestTitle(title) {
        return title.replace(/\[ED-\d{1,6}\]\s*/, '').trim();
    }

    groupTestsByJiraKey(testResults) {
        const groupedTests = {};

        testResults.testResults.forEach(testFile => {
            testFile.assertionResults.forEach(test => {
                const jiraKey = this.extractJiraKey(test.fullName);

                if (jiraKey) {
                    if (!groupedTests[jiraKey]) {
                        groupedTests[jiraKey] = [];
                    }

                    let cleanedTitle = this.cleanTestTitle(test.title);
                    if (!/^verify\s/i.test(cleanedTitle)) {
                        cleanedTitle = 'Verify ' + cleanedTitle;
                    }

                    groupedTests[jiraKey].push({
                        title: cleanedTitle,
                        fullName: test.fullName,
                        status: test.status,
                        failureMessages: test.failureMessages,
                        ancestorTitles: test.ancestorTitles
                    });
                }
            });
        });

        return groupedTests;
    }

    addStepResult(test) {
        let result = {
            statusName: this.status[test.status] || 'fail'
        };

        if (test.failureMessages && test.failureMessages.length > 0) {
            let actualResult = '<b>Failure Messages:</b><br>';
            test.failureMessages.forEach(msg => {
                const escapedMsg = msg.replace(/\n/g, '<br>').replace(/\s/g, '&emsp;');
                actualResult += escapedMsg + '<br>';
            });
            result.actualResult = actualResult;
        }

        return result;
    }

    getOverallTestCaseStatus(tests) {
        const hasFailed = tests.some(test => test.status !== 'passed');
        return hasFailed ? 'fail' : 'pass';
    }


    async processResults() {
        console.log('Starting React test results processing...');

        const testResults = this.readReactTestResults();
        const groupedTests = this.groupTestsByJiraKey(testResults);

        console.log(`Found ${Object.keys(groupedTests).length} Jira tickets with associated tests`);

        if (Object.keys(groupedTests).length === 0) {
            console.log('No tests with Jira ticket references found. Exiting.');
            return;
        }

        const cycleKey = await this.zephyr.addTestRunCycle();
        console.log(`Created test cycle: ${cycleKey}`);

        const processTickets = Object.keys(groupedTests).map(async (jiraKey) => {
            try {
                console.log(`Processing ${jiraKey}...`);
                const tests = groupedTests[jiraKey];

                const folderName = tests[0].ancestorTitles[0];
                const folderId = await this.zephyr.getFolderIdByTitle(folderName);
                console.log(`  Using folder: ${folderName} (ID: ${folderId})`);

                const jiraTicketTitle = await this.jira.getIssueSummaryByKey(jiraKey);
                console.log(`  Jira ticket title: ${jiraTicketTitle}`);

                const testCaseKey = await this.zephyr.getTestCaseIdByTitle(jiraTicketTitle, folderId);
                console.log(`  Test case key: ${testCaseKey}`);

                const issueId = await this.jira.getIssueIdByKey([jiraKey]);
                await this.zephyr.addTestCaseIssueLink(testCaseKey, issueId);
                console.log(`  Linked test case to ${jiraKey}`);

                const steps = tests.map(test => this.addStep(test.title));
                await this.zephyr.addStepsToTestCase(testCaseKey, steps);
                console.log(`  Added ${steps.length} steps to test case`);

                const stepResults = tests.map(test => this.addStepResult(test));

                const overallStatus = this.getOverallTestCaseStatus(tests);

                await this.zephyr.publishResults(cycleKey, testCaseKey, overallStatus, stepResults);
                console.log(`  Published results with status: ${overallStatus}`);

            } catch (error) {
                console.error(`Error processing ${jiraKey}:`, error);
            }
        });

        await Promise.all(processTickets);
        console.log('React test results processing completed!');
    }
}

module.exports = PublishReactTestResults;
