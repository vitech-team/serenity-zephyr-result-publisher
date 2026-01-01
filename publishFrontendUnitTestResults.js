const fs = require('fs')
const BasePublisher = require('./basePublisher.js')


class PublishFrontendUnitTestResults extends BasePublisher {
    constructor() {
        super();
    }

    status = {
        'passed': 'pass',
        'failed': 'fail'
    };

    readFrontendUnitTestResults(filePath = process.env.JSON_INPUT_PATH) {
        return JSON.parse(fs.readFileSync(filePath))
    }

    groupTestsByIssue(testResults) {
        const groupedTests = {};

        testResults.testResults.forEach(testFile => {
            testFile.assertionResults.forEach(test => {

                if (test.issue) {
                    if (!groupedTests[test.issue]) {
                        groupedTests[test.issue] = [];
                    }

                    let cleanedTitle = test.title.trim();
                    if (!/^verify\s/i.test(cleanedTitle)) {
                        cleanedTitle = 'Verify ' + cleanedTitle;
                    }

                    groupedTests[test.issue].push({
                        title: cleanedTitle,
                        fullName: test.fullName,
                        status: test.status,
                        failureMessages: test.failureMessages,
                        feature: test.feature
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


    groupTestsByFeature(tests) {
        const grouped = {};

        tests.forEach(test => {
            const feature = test.feature || 'general';
            if (!grouped[feature]) {
                grouped[feature] = [];
            }
            grouped[feature].push(test);
        });

        return grouped;
    }

    async processResults() {
        console.log('Starting frontend unit test results processing...');

        const testResults = this.readFrontendUnitTestResults();
        const groupedTestsByIssue = this.groupTestsByIssue(testResults);

        if (Object.keys(groupedTestsByIssue).length === 0) {
            console.log('No tests with issue field found. Exiting.');
            return;
        }

        const cycleKey = await this.zephyr.addTestRunCycle("Frontend-unit-test-");
        console.log(`Created test cycle: ${cycleKey}`);

        const processIssues = Object.keys(groupedTestsByIssue).map(async (issueKey) => {
            try {
                console.log(`Processing ${issueKey}...`);
                const tests = groupedTestsByIssue[issueKey];

                const testsByFeature = this.groupTestsByFeature(tests);

                const jiraTicketTitle = await this.jira.getIssueSummaryByKey(issueKey);
                const issueId = await this.jira.getIssueIdByKey([issueKey]);
                const testCaseName = `${jiraTicketTitle} verifications`;

                const processFeatureGroups = Object.keys(testsByFeature).map(async (feature) => {
                    const featureTests = testsByFeature[feature];

                    const folderName = feature.charAt(0).toUpperCase() + feature.slice(1) + " verifications by Frontend Unit Tests";
                    const folderId = await this.zephyr.getFolderIdByTitle(folderName);

                    const testCaseKey = await this.zephyr.getTestCaseIdByTitle(testCaseName, folderId);
                    await this.zephyr.addTestCaseIssueLink(testCaseKey, issueId);

                    const steps = featureTests.map(test => this.addStep(test.title));
                    await this.zephyr.addStepsToTestCase(testCaseKey, steps);

                    const stepResults = featureTests.map(test => this.addStepResult(test));
                    const overallStatus = this.getOverallTestCaseStatus(featureTests);

                    await this.zephyr.publishResults(cycleKey, testCaseKey, overallStatus, stepResults);
                });

                await Promise.all(processFeatureGroups);

            } catch (error) {
                console.error(`Error processing ${issueKey}:`, error);
            }
        });

        await Promise.all(processIssues);
        console.log('Frontend unit test results processing completed!');
    }
}

module.exports = PublishFrontendUnitTestResults;
