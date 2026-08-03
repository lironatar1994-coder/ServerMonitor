const test = require('node:test');
const assert = require('node:assert/strict');
const { findAppForSiteUrl, normalizeWebsiteIdentity } = require('../siteIdentity');

const apps = [
    { id: 1, name: 'Vee', url: 'https://vee-app.co.il/' },
    { id: 8, name: 'Miryam Zelig', url: 'https://vee-app.co.il/Miryam_Zelig/' },
    { id: 9, name: 'Libi Diamonds', url: 'https://www.libidiamonds.co.il/' }
];

test('normalizes protocol, www, path case, query strings, and trailing slashes', () => {
    assert.equal(
        normalizeWebsiteIdentity('http://WWW.VEE-APP.CO.IL/Miryam_Zelig/?campaign=summer#top'),
        'vee-app.co.il/miryam_zelig'
    );
});

test('maps a Manager Site URL to one exact monitored app', () => {
    assert.equal(findAppForSiteUrl(apps, 'https://vee-app.co.il/miryam_zelig').id, 8);
    assert.equal(findAppForSiteUrl(apps, 'https://libidiamonds.co.il').id, 9);
});

test('does not fall back to a host-only match when the path identifies another app', () => {
    assert.equal(findAppForSiteUrl(apps, 'https://vee-app.co.il/another-client'), null);
});

test('fails closed when more than one monitored app has the same canonical URL', () => {
    assert.equal(findAppForSiteUrl([...apps, { id: 10, url: apps[1].url }], apps[1].url), null);
});
