const core = require('./core_db');
const model = require('./model_db');
const collection = require('./collection_db');
const file = require('./file_db');
const tag = require('./tag_db');

module.exports = {
    ...core,
    ...model,
    ...collection,
    ...file,
    ...tag
};
