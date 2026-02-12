const core = require('./core');
const model = require('./model');
const collection = require('./collection');
const file = require('./file');
const tag = require('./tag');

module.exports = {
    ...core,
    ...model,
    ...collection,
    ...file,
    ...tag
};
