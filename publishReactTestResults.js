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
        return title.replace(/\[ED-\d{1,6}]\s*/, '').trim();
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
        } else {
            result.actualResult = 'Verified';
        }

        return result;
    }

    getOverallTestCaseStatus(tests) {
        const hasFailed = tests.some(test => test.status !== 'passed');
        return hasFailed ? 'fail' : 'pass';
    }


    groupTestsByAncestorTitle(tests) {
        const grouped = {};

        tests.forEach(test => {
            const ancestorTitle = test.ancestorTitles[0];
            if (!grouped[ancestorTitle]) {
                grouped[ancestorTitle] = [];
            }
            grouped[ancestorTitle].push(test);
        });

        return grouped;
    }

    async processResults() {
        console.log('Starting React test results processing...');

        const testResults = this.readReactTestResults();
        const groupedTestsByJiraKey = this.groupTestsByJiraKey(testResults);

        if (Object.keys(groupedTestsByJiraKey).length === 0) {
            console.log('No tests with Jira ticket references found. Exiting.');
            return;
        }

        const cycleKey = await this.zephyr.addTestRunCycle();
        console.log(`Created test cycle: ${cycleKey}`);

        const processTickets = Object.keys(groupedTestsByJiraKey).map(async (jiraKey) => {
            try {
                console.log(`Processing ${jiraKey}...`);
                const tests = groupedTestsByJiraKey[jiraKey];

                const testsByAncestor = this.groupTestsByAncestorTitle(tests);

                const jiraTicketTitle = await this.jira.getIssueSummaryByKey(jiraKey);
                const issueId = await this.jira.getIssueIdByKey([jiraKey]);
                const testCaseName = `${jiraTicketTitle} verifications`;

                const processAncestorGroups = Object.keys(testsByAncestor).map(async (ancestorTitle) => {
                    const ancestorTests = testsByAncestor[ancestorTitle];

                    const folderName = ancestorTitle + " verifications by React Tests";
                    const folderId = await this.zephyr.getFolderIdByTitle(folderName);

                    const testCaseKey = await this.zephyr.getTestCaseIdByTitle(testCaseName, folderId);
                    await this.zephyr.addTestCaseIssueLink(testCaseKey, issueId);

                    const steps = ancestorTests.map(test => this.addStep(test.title));
                    await this.zephyr.addStepsToTestCase(testCaseKey, steps);

                    const stepResults = ancestorTests.map(test => this.addStepResult(test));
                    const overallStatus = this.getOverallTestCaseStatus(ancestorTests);

                    await this.zephyr.publishResults(cycleKey, testCaseKey, overallStatus, stepResults);
                });

                await Promise.all(processAncestorGroups);

            } catch (error) {
                console.error(`Error processing ${jiraKey}:`, error);
            }
        });

        await Promise.all(processTickets);
        console.log('React test results processing completed!');
    }
}

module.exports = PublishReactTestResults;
