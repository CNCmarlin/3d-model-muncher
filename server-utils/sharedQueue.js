const { CollectionQueue } = require('./collectionQueue');
const { loadCollections, saveCollections } = require('./dataAccess');

// Singleton instance to ensure all modules share the same concurrency lock
const collectionQueue = new CollectionQueue(loadCollections, saveCollections);

module.exports = {
    collectionQueue
};
