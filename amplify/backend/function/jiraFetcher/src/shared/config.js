/**
 * Multi-project configuration helpers.
 * Provides S3 key namespacing for multi-project storage.
 * No I/O dependencies — safe to use in Lambda, dev server, or tests.
 */

/**
 * Get the storage prefix for a project.
 * @param {string} projectKey - Jira project key (e.g., 'RHOAIENG')
 * @returns {string} Storage prefix (e.g., 'data/RHOAIENG/')
 */
function getStoragePrefix(projectKey) {
  return `data/${projectKey}/`;
}

/**
 * Prefix a storage key with the project namespace.
 * @param {string} projectKey - Jira project key
 * @param {string} key - Storage key (e.g., 'boards.json')
 * @returns {string} Namespaced key (e.g., 'data/RHOAIENG/boards.json')
 */
function prefixKey(projectKey, key) {
  return `data/${projectKey}/${key}`;
}

/**
 * Get the history storage key for a sprint snapshot.
 * @param {string} projectKey - Jira project key
 * @param {number} boardId - Board ID
 * @param {number} sprintId - Sprint ID
 * @returns {string} History key (e.g., 'data/history/RHOAIENG/42/100.json')
 */
function getHistoryKey(projectKey, boardId, sprintId) {
  return `data/history/${projectKey}/${boardId}/${sprintId}.json`;
}

/**
 * Create read/write functions that automatically prepend a storage prefix.
 * @param {string} prefix - Storage prefix (e.g., 'data/RHOAIENG/')
 * @param {function} readStorage - Original read function
 * @param {function} writeStorage - Original write function
 * @returns {{ read: function, write: function }}
 */
function createPrefixedStorage(prefix, readStorage, writeStorage) {
  return {
    read: (key) => readStorage(`${prefix}${key}`),
    write: (key, data) => writeStorage(`${prefix}${key}`, data)
  };
}

module.exports = {
  getStoragePrefix,
  prefixKey,
  getHistoryKey,
  createPrefixedStorage
};
