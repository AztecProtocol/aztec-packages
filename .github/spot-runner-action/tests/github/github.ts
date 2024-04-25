import { expect } from 'chai';
import { GithubClient } from '../../src/github/github';
import { ActionConfig } from '../../src/config/config';

describe('Github API tests', () => {
    const config = new ActionConfig()
    const githubClient = new GithubClient(config);

    it('get latest runner release version', async () => {
        const version = await githubClient.getRunnerVersion()
        expect(version).is.string;
        expect(version.length).to.greaterThan(0);
    });

    it('list runners with labels for repo', async () => {
        const runners = await githubClient.getRunnersWithLabels(["self-hosted", "Linux"])
        expect(runners).not.throw
    });

    it('get runner registration token for repo', async () => {
        const token = await githubClient.getRunnerRegistrationToken()
        expect(token.token).is.not.undefined;
        expect(token.token.length).to.greaterThan(0);
        expect(token.expires_at).is.not.undefined;
        expect(token.expires_at.length).to.greaterThan(0);
    });

    it('list runners with labels for repo', async () => {
        const runners = await githubClient.removeRunnersWithLabels(["foo", "bar"])
        expect(runners).is.true
    });

});