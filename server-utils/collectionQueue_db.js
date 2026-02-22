// server-utils/collectionQueue.js

class CollectionQueue {
  /**
   * @param {Function} loadFn - Function to load current collections (synchronous or async)
   * @param {Function} saveFn - Function to save collections (synchronous or async)
   */
  constructor(loadFn, saveFn) {
    this.loadFn = loadFn;
    this.saveFn = saveFn;
    this.queue = [];
    this.isProcessing = false;
  }

  /**
   * Add a task to the queue.
   * @param {Function} taskFn - A function that receives the current data and returns the modified data.
   * @returns {Promise<any>} - Resolves with the new data after saving.
   */
  add(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.process();
    });
  }

  async process() {
    // If already running or empty, do nothing
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const { taskFn, resolve, reject } = this.queue.shift();

    try {
      // 1. Load fresh data
      let currentData = this.loadFn();
      if (currentData instanceof Promise) currentData = await currentData;

      // 2. Run the modification task
      let newData = taskFn(currentData);
      if (newData instanceof Promise) newData = await newData;

      // 3. Save the result
      let saveResult = this.saveFn(newData);
      if (saveResult instanceof Promise) saveResult = await saveResult;

      // 4. Success!
      resolve(newData);
    } catch (error) {
      console.error('[CollectionQueue] Error processing task:', error);
      reject(error);
    } finally {
      this.isProcessing = false;
      // 5. Trigger next item
      if (this.queue.length > 0) {
        this.process();
      }
    }
  }
}

module.exports = { CollectionQueue };