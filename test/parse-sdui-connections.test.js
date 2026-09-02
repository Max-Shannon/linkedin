const assert = require('assert');
const { parseConnectionsFromSduiResponse } = require('../lib/parse-sdui-connections');

const rscSample = `
{"componentKey":{"$type":"proto.sdui.Key","value":{"$case":"id","id":"ConnectionCard_0-jane-doe"}},"key":"ConnectionCard_0-jane-doe"}
{"id":"profile_name_loading_state","value":{"$case":"stringValue","stringValue":"Jane Doe"}}
{"id":"profile_name_loading_state","value":{"$case":"stringValue","stringValue":"Jane Doe"}}
{"id":"profile_headline_loading_state","value":{"$case":"stringValue","stringValue":"Engineer at Example"}}
{"id":"profile_headline_loading_state","value":{"$case":"stringValue","stringValue":"Engineer at Example"}}
"children":["Connected on January 15, 2026"]
{"componentKey":{"$type":"proto.sdui.Key","value":{"$case":"id","id":"ConnectionCard_0-john-smith"}},"key":"ConnectionCard_0-john-smith"}
{"id":"profile_name_loading_state","value":{"$case":"stringValue","stringValue":"John Smith"}}
{"id":"profile_name_loading_state","value":{"$case":"stringValue","stringValue":"John Smith"}}
{"id":"profile_headline_loading_state","value":{"$case":"stringValue","stringValue":"Founder"}}
{"id":"profile_headline_loading_state","value":{"$case":"stringValue","stringValue":"Founder"}}
"children":["Connected on January 10, 2026"]
{"componentKey":{"$type":"proto.sdui.Key","value":{"$case":"id","id":"ConnectionCard_12-naoise-ó-cearúil-td"}},"key":"ConnectionCard_12-naoise-ó-cearúil-td"}
{"id":"profile_name_loading_state","value":{"$case":"stringValue","stringValue":"Naoise Example"}}
{"id":"profile_name_loading_state","value":{"$case":"stringValue","stringValue":"Naoise Example"}}
{"id":"profile_headline_loading_state","value":{"$case":"stringValue","stringValue":"TD"}}
{"id":"profile_headline_loading_state","value":{"$case":"stringValue","stringValue":"TD"}}
"children":["Connected on February 1, 2026"]
`;

const rscRows = parseConnectionsFromSduiResponse(rscSample);
assert.strictEqual(rscRows.length, 3);
assert.strictEqual(rscRows[0].name, 'Jane Doe');
assert.strictEqual(rscRows[0].title, 'Engineer at Example');
assert.strictEqual(rscRows[0].vanityName, 'jane-doe');
assert.strictEqual(rscRows[0].connectedOn, 'January 15, 2026');
assert.strictEqual(rscRows[1].name, 'John Smith');
assert.strictEqual(rscRows[1].vanityName, 'john-smith');
assert.strictEqual(rscRows[2].vanityName, 'naoise-ó-cearúil-td');
assert.strictEqual(rscRows[2].name, 'Naoise Example');

const legacySample =
  '"viewName":"connections-list"' +
  '"viewName":"connections-profile","children":["Ada Lovelace"]' +
  '"textProps":{"children":["Mathematician"],"linkColorTokens"' +
  '"children":["Connected on June 1, 2020"]' +
  'linkedin.com\\/in\\/ada-lovelace/' +
  '"viewName":"message-button"';

const legacyRows = parseConnectionsFromSduiResponse(legacySample);
assert.strictEqual(legacyRows.length, 1);
assert.strictEqual(legacyRows[0].name, 'Ada Lovelace');
assert.strictEqual(legacyRows[0].vanityName, 'ada-lovelace');
assert.strictEqual(legacyRows[0].connectedOn, 'June 1, 2020');

console.log('parse-sdui-connections tests passed');
