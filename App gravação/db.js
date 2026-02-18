/**
 * db.js — IndexedDB Persistence Layer
 * Medical Scribe v1.0
 * Stores: consultations, bi_records, settings
 */

const MedScribeDB = (() => {
    const DB_NAME = 'MedScribeDB';
    const DB_VERSION = 2;
    let db = null;

    // ── Sync Configuration ──
    const SyncConfig = {
        endpoint: '',       // Set to your API URL (e.g. 'https://api.example.com/sync')
        apiKey: '',         // API key for authentication
        enabled: false,     // Enable/disable sync
        maxRetries: 5,
        autoSync: true,     // Auto-sync when online
    };

    function open() {
        return new Promise((resolve, reject) => {
            if (db) return resolve(db);
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const database = e.target.result;

                if (!database.objectStoreNames.contains('consultations')) {
                    const store = database.createObjectStore('consultations', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('cenario', 'cenario', { unique: false });
                }
                if (!database.objectStoreNames.contains('bi_records')) {
                    const store = database.createObjectStore('bi_records', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('cid_principal', 'cid_principal', { unique: false });
                    store.createIndex('cenario', 'cenario', { unique: false });
                }
                if (!database.objectStoreNames.contains('settings')) {
                    database.createObjectStore('settings', { keyPath: 'key' });
                }
                // v2: Sync queue store
                if (!database.objectStoreNames.contains('sync_queue')) {
                    const syncStore = database.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('status', 'status', { unique: false });
                    syncStore.createIndex('storeName', 'storeName', { unique: false });
                    syncStore.createIndex('created_at', 'created_at', { unique: false });
                }
            };

            request.onsuccess = (e) => {
                db = e.target.result;
                // Setup online/offline listeners
                _setupConnectivityListeners();
                resolve(db);
            };

            request.onerror = (e) => reject(e.target.error);
        });
    }

    async function _getStore(storeName, mode = 'readonly') {
        const database = await open();
        const tx = database.transaction(storeName, mode);
        return tx.objectStore(storeName);
    }

    async function add(storeName, data) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.add(data);
            request.onsuccess = () => {
                const recordId = request.result;
                // Queue for sync (non-blocking)
                _queueForSync(storeName, { ...data, id: recordId }).catch(err => {
                    console.warn('[DB] Sync queue error:', err);
                });
                resolve(recordId);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function getAll(storeName) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getById(storeName, id) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function update(storeName, data) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.put(data);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function remove(storeName, id) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function clearStore(storeName) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async function countRecords(storeName) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function getByIndex(storeName, indexName, value) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const index = store.index(indexName);
            const request = index.getAll(value);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    // ══════════════════════════════════════════════════════
    // SYNC ENGINE
    // ══════════════════════════════════════════════════════

    /**
     * Queue a record for sync
     */
    async function _queueForSync(storeName, data) {
        if (storeName === 'sync_queue' || storeName === 'settings') return;
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction('sync_queue', 'readwrite');
            const store = tx.objectStore('sync_queue');
            const entry = {
                storeName,
                data,
                status: 'pending',      // pending | synced | failed
                retries: 0,
                created_at: new Date().toISOString(),
                last_attempt: null,
                error: null,
            };
            const request = store.add(entry);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Sync pending records to external API
     * @returns {Object} { synced: number, failed: number, remaining: number }
     */
    async function syncToAPI() {
        if (!SyncConfig.enabled || !SyncConfig.endpoint) {
            console.log('[DB Sync] Sync disabled or no endpoint configured');
            return { synced: 0, failed: 0, remaining: 0, skipped: true };
        }

        if (!navigator.onLine) {
            console.log('[DB Sync] Offline — sync deferred');
            return { synced: 0, failed: 0, remaining: 0, offline: true };
        }

        const database = await open();
        const pending = await _getPendingSync();
        let synced = 0, failed = 0;

        for (const entry of pending) {
            try {
                const response = await fetch(SyncConfig.endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(SyncConfig.apiKey ? { 'X-API-Key': SyncConfig.apiKey } : {}),
                    },
                    body: JSON.stringify({
                        storeName: entry.storeName,
                        data: entry.data,
                        syncId: entry.id,
                        timestamp: entry.created_at,
                    }),
                });

                if (response.ok) {
                    // Mark as synced
                    await _updateSyncEntry(entry.id, { status: 'synced', last_attempt: new Date().toISOString() });
                    synced++;
                    console.log(`[DB Sync] ✅ Synced entry #${entry.id} (${entry.storeName})`);
                } else {
                    throw new Error(`HTTP ${response.status}`);
                }
            } catch (err) {
                const newRetries = entry.retries + 1;
                const newStatus = newRetries >= SyncConfig.maxRetries ? 'failed' : 'pending';
                await _updateSyncEntry(entry.id, {
                    status: newStatus,
                    retries: newRetries,
                    last_attempt: new Date().toISOString(),
                    error: err.message,
                });
                failed++;
                console.warn(`[DB Sync] ❌ Entry #${entry.id} failed (attempt ${newRetries}/${SyncConfig.maxRetries}):`, err.message);
            }
        }

        const remaining = await _countByStatus('pending');
        console.log(`[DB Sync] Complete — synced: ${synced}, failed: ${failed}, remaining: ${remaining}`);
        return { synced, failed, remaining };
    }

    async function _getPendingSync() {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction('sync_queue', 'readonly');
            const store = tx.objectStore('sync_queue');
            const index = store.index('status');
            const request = index.getAll('pending');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function _updateSyncEntry(id, updates) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction('sync_queue', 'readwrite');
            const store = tx.objectStore('sync_queue');
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const entry = { ...getReq.result, ...updates };
                const putReq = store.put(entry);
                putReq.onsuccess = () => resolve();
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    async function _countByStatus(status) {
        const database = await open();
        return new Promise((resolve, reject) => {
            const tx = database.transaction('sync_queue', 'readonly');
            const store = tx.objectStore('sync_queue');
            const index = store.index('status');
            const request = index.count(status);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    /**
     * Get sync status summary
     */
    async function getSyncStatus() {
        const pending = await _countByStatus('pending');
        const synced = await _countByStatus('synced');
        const failed = await _countByStatus('failed');
        return { pending, synced, failed, online: navigator.onLine, enabled: SyncConfig.enabled };
    }

    /**
     * Configure sync endpoint
     */
    function setSyncEndpoint(endpoint, apiKey = '') {
        SyncConfig.endpoint = endpoint;
        SyncConfig.apiKey = apiKey;
        SyncConfig.enabled = !!endpoint;
        console.log(`[DB Sync] Endpoint set: ${endpoint ? endpoint : '(disabled)'}`);
    }

    /**
     * Setup online/offline event listeners
     */
    function _setupConnectivityListeners() {
        window.addEventListener('online', () => {
            console.log('[DB Sync] Back online — triggering sync...');
            if (SyncConfig.autoSync && SyncConfig.enabled) {
                // Delay to let connection stabilize
                setTimeout(() => syncToAPI(), 2000);
            }
        });

        window.addEventListener('offline', () => {
            console.log('[DB Sync] Went offline — sync paused');
        });
    }

    /**
     * Retry failed sync entries (reset status to pending)
     */
    async function retryFailedSync() {
        const database = await open();
        return new Promise(async (resolve, reject) => {
            const tx = database.transaction('sync_queue', 'readwrite');
            const store = tx.objectStore('sync_queue');
            const index = store.index('status');
            const request = index.getAll('failed');
            request.onsuccess = async () => {
                const failedEntries = request.result;
                for (const entry of failedEntries) {
                    entry.status = 'pending';
                    entry.retries = 0;
                    entry.error = null;
                    store.put(entry);
                }
                resolve(failedEntries.length);
            };
            request.onerror = () => reject(request.error);
        });
    }

    return {
        open, add, getAll, getById, update, remove, clearStore, countRecords, getByIndex,
        // Sync API
        syncToAPI, getSyncStatus, setSyncEndpoint, retryFailedSync, SyncConfig,
    };
})();
