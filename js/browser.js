/**
 * DJ Mix Web - Browser & Playlist
 * File browser and playlist management
 */

class FileBrowser {
    constructor(audioEngine) {
        this.audioEngine = audioEngine;
        this.playlist = null;

        // DOM elements
        this.folderTree = document.getElementById('folderTree');
        this.fileListContent = document.getElementById('fileListContent');
        this.openFolderBtn = document.getElementById('openFolderBtn');

        // State
        this.folders = []; // Array of { name, handle, files }
        this.selectedFolder = null;
        this.audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'];

        // Bind methods
        this.openFolder = this.openFolder.bind(this);
        this.renderFolderTree = this.renderFolderTree.bind(this);
        this.renderFileList = this.renderFileList.bind(this);

        // Setup event listeners
        this.setupEventListeners();
    }

    /**
     * Set playlist reference
     */
    setPlaylist(playlist) {
        this.playlist = playlist;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Use event delegation as fallback
        document.addEventListener('click', (e) => {
            if (e.target.id === 'openFolderBtn' || e.target.closest('#openFolderBtn')) {
                e.preventDefault();
                this.openFolder();
            }
        });

        // Also attach directly if element exists
        if (this.openFolderBtn) {
            this.openFolderBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.openFolder();
            });
        }
    }

    /**
     * Check if File System Access API is supported
     */
    isFileSystemAccessSupported() {
        return 'showDirectoryPicker' in window;
    }

    /**
     * Open folder picker
     */
    async openFolder() {
        console.log('openFolder called');

        if (!this.isFileSystemAccessSupported()) {
            console.log('File System Access API not supported, using fallback');
            // Fallback for browsers without File System Access API
            this.openFolderFallback();
            return;
        }

        try {
            console.log('Opening directory picker...');
            const dirHandle = await window.showDirectoryPicker({
                mode: 'read'
            });
            console.log('Directory selected:', dirHandle.name);

            const folderData = {
                name: dirHandle.name,
                handle: dirHandle,
                files: [],
                subfolders: []
            };

            // Scan folder for audio files and subfolders
            await this.scanFolder(dirHandle, folderData);

            // Add to folders list
            this.folders.push(folderData);

            // Render folder tree
            this.renderFolderTree();

            // Select the new folder
            this.selectFolder(folderData);

        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Error opening folder:', error);
            }
        }
    }

    /**
     * Fallback for browsers without File System Access API
     */
    openFolderFallback() {
        const input = document.createElement('input');
        input.type = 'file';
        input.webkitdirectory = true;
        input.multiple = true;

        input.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            if (files.length === 0) return;

            // Get folder name from path
            const firstFile = files[0];
            const pathParts = firstFile.webkitRelativePath.split('/');
            const folderName = pathParts[0];

            // Filter audio files
            const audioFiles = files.filter(file =>
                this.audioExtensions.some(ext =>
                    file.name.toLowerCase().endsWith(ext)
                )
            );

            // Build recursive folder structure
            const folderData = {
                name: folderName,
                handle: null,
                files: [],
                subfolders: []
            };

            // Helper to get or create nested folder
            const getOrCreateFolder = (parentFolder, pathParts) => {
                if (pathParts.length === 0) return parentFolder;

                const folderName = pathParts[0];
                let subfolder = parentFolder.subfolders.find(sf => sf.name === folderName);

                if (!subfolder) {
                    subfolder = {
                        name: folderName,
                        handle: null,
                        files: [],
                        subfolders: []
                    };
                    parentFolder.subfolders.push(subfolder);
                }

                return getOrCreateFolder(subfolder, pathParts.slice(1));
            };

            // Organize files into folder structure
            audioFiles.forEach(file => {
                const parts = file.webkitRelativePath.split('/');
                // parts[0] is root folder, parts[1..n-1] are subfolders, parts[n] is filename
                const subfolderPath = parts.slice(1, -1); // Get subfolder path (exclude root and filename)

                const targetFolder = getOrCreateFolder(folderData, subfolderPath);
                targetFolder.files.push({
                    name: file.name,
                    file: file,
                    path: file.webkitRelativePath
                });
            });

            // Sort all folders recursively
            const sortFolder = (folder) => {
                folder.files.sort((a, b) => a.name.localeCompare(b.name));
                folder.subfolders.sort((a, b) => a.name.localeCompare(b.name));
                folder.subfolders.forEach(sortFolder);
            };
            sortFolder(folderData);

            this.folders.push(folderData);
            this.renderFolderTree();
            this.selectFolder(folderData);
        });

        input.click();
    }

    /**
     * Scan folder for audio files (recursive)
     */
    async scanFolder(dirHandle, folderData, basePath = '') {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file') {
                const name = entry.name.toLowerCase();
                if (this.audioExtensions.some(ext => name.endsWith(ext))) {
                    folderData.files.push({
                        name: entry.name,
                        handle: entry,
                        path: basePath ? `${basePath}/${entry.name}` : entry.name
                    });
                }
            } else if (entry.kind === 'directory') {
                const subfolder = {
                    name: entry.name,
                    handle: entry,
                    files: [],
                    subfolders: []
                };

                // Recursively scan subfolder
                const subPath = basePath ? `${basePath}/${entry.name}` : entry.name;
                await this.scanFolder(entry, subfolder, subPath);

                // Only add subfolder if it has files or subfolders with files
                if (subfolder.files.length > 0 || subfolder.subfolders.length > 0) {
                    folderData.subfolders.push(subfolder);
                }
            }
        }

        // Sort files alphabetically
        folderData.files.sort((a, b) => a.name.localeCompare(b.name));
        folderData.subfolders.sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Render folder tree
     */
    renderFolderTree() {
        if (this.folders.length === 0) {
            this.folderTree.innerHTML = `
                <div class="folder-placeholder">
                    <span>Click "Add Folder" to browse music</span>
                </div>
            `;
            return;
        }

        let html = '';

        // Recursive helper to render folders at any depth
        const renderFolder = (folder, folderIndex, path = [], depth = 0) => {
            const isSelected = this.selectedFolder === folder;
            const pathStr = path.join(',');
            const indent = depth * 12; // 12px per level

            html += `
                <div class="folder-item ${isSelected ? 'selected' : ''}"
                     data-folder-index="${folderIndex}"
                     data-folder-path="${pathStr}"
                     data-depth="${depth}"
                     style="padding-left: ${8 + indent}px"
                     draggable="true">
                    <span class="folder-icon">${depth === 0 ? '&#128193;' : '&#128194;'}</span>
                    <span class="folder-name">${folder.name}</span>
                </div>
            `;

            // Render subfolders recursively
            folder.subfolders.forEach((subfolder, subIndex) => {
                const newPath = [...path, subIndex];
                renderFolder(subfolder, folderIndex, newPath, depth + 1);
            });
        };

        this.folders.forEach((folder, folderIndex) => {
            renderFolder(folder, folderIndex);
        });

        this.folderTree.innerHTML = html;

        // Add event listeners
        this.folderTree.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const folderIndex = parseInt(item.dataset.folderIndex);
                const folderPath = item.dataset.folderPath;

                const folder = this.getFolderByPath(folderIndex, folderPath);
                if (folder) {
                    this.selectFolder(folder);
                }
            });

            // Drag folder to playlist (adds all files)
            item.addEventListener('dragstart', (e) => {
                const folderIndex = parseInt(item.dataset.folderIndex);
                const folderPath = item.dataset.folderPath;

                e.dataTransfer.setData('application/x-folder', JSON.stringify({
                    folderIndex,
                    folderPath,
                    type: 'folder'
                }));
                e.dataTransfer.effectAllowed = 'copy';
            });
        });
    }

    /**
     * Get folder by path (array of subfolder indices)
     */
    getFolderByPath(folderIndex, pathStr) {
        let folder = this.folders[folderIndex];
        if (!folder) return null;

        if (!pathStr || pathStr === '') return folder;

        const path = pathStr.split(',').map(Number);
        for (const subIndex of path) {
            if (!folder.subfolders || !folder.subfolders[subIndex]) {
                return null;
            }
            folder = folder.subfolders[subIndex];
        }
        return folder;
    }

    /**
     * Select a folder and show its files
     */
    selectFolder(folder) {
        this.selectedFolder = folder;
        this.renderFolderTree();
        this.renderFileList();
    }

    /**
     * Render file list
     */
    renderFileList() {
        if (!this.selectedFolder || this.selectedFolder.files.length === 0) {
            this.fileListContent.innerHTML = `
                <div class="file-placeholder">
                    <span>${this.selectedFolder ? 'No audio files in this folder' : 'Select a folder to view files'}</span>
                </div>
            `;
            return;
        }

        let html = '';

        this.selectedFolder.files.forEach((file, index) => {
            const displayName = Utils.getFileNameWithoutExt(file.name);
            html += `
                <div class="file-item"
                     data-file-index="${index}"
                     draggable="true">
                    <span class="file-icon">&#9835;</span>
                    <span class="file-name" title="${file.name}">${displayName}</span>
                    <span class="file-duration">--:--</span>
                </div>
            `;
        });

        this.fileListContent.innerHTML = html;

        // Add event listeners
        this.fileListContent.querySelectorAll('.file-item').forEach(item => {
            const fileIndex = parseInt(item.dataset.fileIndex);
            const fileData = this.selectedFolder.files[fileIndex];

            // Double click to add to playlist
            item.addEventListener('dblclick', async () => {
                const file = await this.getFileObject(fileData);
                if (file && this.playlist) {
                    this.playlist.addTrack(file);
                }
            });

            // Drag to playlist or deck
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/x-audio-file', JSON.stringify({
                    fileIndex,
                    type: 'file'
                }));
                e.dataTransfer.effectAllowed = 'copy';
                item.classList.add('dragging');

                // Store reference for drop handler
                this._draggedFileData = fileData;
            });

            item.addEventListener('dragend', () => {
                item.classList.remove('dragging');
                this._draggedFileData = null;
            });
        });
    }

    /**
     * Get file object from file data
     */
    async getFileObject(fileData) {
        if (fileData.file) {
            // Fallback mode - file object already available
            return fileData.file;
        } else if (fileData.handle) {
            // File System Access API mode
            try {
                return await fileData.handle.getFile();
            } catch (error) {
                console.error('Error getting file:', error);
                return null;
            }
        }
        return null;
    }

    /**
     * Get all files from a folder (non-recursive, direct files only)
     */
    async getFolderFiles(folderData) {
        const files = [];
        for (const fileData of folderData.files) {
            const file = await this.getFileObject(fileData);
            if (file) {
                files.push(file);
            }
        }
        return files;
    }

    /**
     * Get all files from a folder recursively (including all subfolders)
     */
    async getAllFolderFiles(folderData) {
        const files = [];

        // Get direct files
        for (const fileData of folderData.files) {
            const file = await this.getFileObject(fileData);
            if (file) {
                files.push(file);
            }
        }

        // Recursively get files from subfolders
        for (const subfolder of folderData.subfolders) {
            const subFiles = await this.getAllFolderFiles(subfolder);
            files.push(...subFiles);
        }

        return files;
    }

    /**
     * Get dragged file data
     */
    getDraggedFileData() {
        return this._draggedFileData;
    }

    /**
     * Get folder by indices
     */
    getFolderByIndices(folderIndex, subfolderIndex) {
        if (subfolderIndex !== undefined) {
            return this.folders[folderIndex].subfolders[parseInt(subfolderIndex)];
        }
        return this.folders[folderIndex];
    }
}

/**
 * Playlist Manager
 */
class Playlist {
    constructor(audioEngine, browser) {
        this.audioEngine = audioEngine;
        this.browser = browser;

        // DOM elements
        this.playlistContent = document.getElementById('playlistContent');
        this.playlistCount = document.getElementById('playlistCount');
        this.clearPlaylistBtn = document.getElementById('clearPlaylistBtn');

        // State
        this.tracks = []; // Array of { file, name, duration }
        this.currentPlayingIndex = -1;

        // Auto-load state
        this.autoLoadEnabled = localStorage.getItem('playlistAutoLoad') === 'true';
        this.autoLoadDelay = 10000; // 10 seconds
        this.autoLoadTimers = { A: null, B: null };
        this.deckWasPlaying = { A: false, B: false };

        // Bind methods
        this.addTrack = this.addTrack.bind(this);
        this.removeTrack = this.removeTrack.bind(this);
        this.clearPlaylist = this.clearPlaylist.bind(this);
        this.render = this.render.bind(this);

        // Setup event listeners
        this.setupEventListeners();
        this.setupDropZone();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.clearPlaylistBtn.addEventListener('click', this.clearPlaylist);

        // Listen for track loaded to mark as playing
        this.audioEngine.on('trackLoaded', (deckId, trackInfo) => {
            // Find matching track in playlist
            const index = this.tracks.findIndex(t =>
                Utils.getFileNameWithoutExt(t.file.name) === trackInfo.name
            );
            if (index !== -1) {
                this.currentPlayingIndex = index;
                this.render();
            }
        });

        // Auto-load toggle
        const autoLoadCheckbox = document.getElementById('autoLoadEnabled');
        if (autoLoadCheckbox) {
            autoLoadCheckbox.checked = this.autoLoadEnabled;
            autoLoadCheckbox.addEventListener('change', (e) => {
                this.autoLoadEnabled = e.target.checked;
                localStorage.setItem('playlistAutoLoad', this.autoLoadEnabled);
            });
        }

        // Track when decks are playing
        this.audioEngine.on('play', (deckId) => {
            this.deckWasPlaying[deckId] = true;
        });

        // Listen for track ended to auto-load next
        // Only trigger if the deck was actually playing (not just loading a new track)
        const handleTrackFinished = (deckId) => {
            // Only auto-load if deck was playing and auto-load is enabled
            if (this.deckWasPlaying[deckId] && this.autoLoadEnabled && this.tracks.length > 0) {
                console.log('Track finished on deck', deckId, '- scheduling auto-load in 10 seconds');
                this.scheduleAutoLoad(deckId);
            }
            // Reset the flag
            this.deckWasPlaying[deckId] = false;
        };

        this.audioEngine.on('trackEnded', handleTrackFinished);
        this.audioEngine.on('stop', handleTrackFinished);
    }

    /**
     * Schedule auto-load of next track after delay
     */
    scheduleAutoLoad(deckId) {
        // Cancel previous timer if exists
        if (this.autoLoadTimers[deckId]) {
            clearTimeout(this.autoLoadTimers[deckId]);
        }

        // Schedule load after delay
        this.autoLoadTimers[deckId] = setTimeout(() => {
            if (this.tracks.length > 0) {
                console.log('Auto-load timer fired, loading next track to deck', deckId);
                this.loadNextTrack(deckId);
            }
            this.autoLoadTimers[deckId] = null;
        }, this.autoLoadDelay);
    }

    /**
     * Setup drop zone for playlist
     */
    setupDropZone() {
        this.playlistContent.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            this.playlistContent.classList.add('drag-over');
        });

        this.playlistContent.addEventListener('dragleave', (e) => {
            if (!this.playlistContent.contains(e.relatedTarget)) {
                this.playlistContent.classList.remove('drag-over');
            }
        });

        this.playlistContent.addEventListener('drop', async (e) => {
            e.preventDefault();
            this.playlistContent.classList.remove('drag-over');

            // Check for folder drop
            const folderData = e.dataTransfer.getData('application/x-folder');
            if (folderData) {
                try {
                    const data = JSON.parse(folderData);
                    const folder = this.browser.getFolderByPath(data.folderIndex, data.folderPath);
                    if (folder) {
                        // Get all files recursively from folder and subfolders
                        const files = await this.browser.getAllFolderFiles(folder);
                        files.forEach(file => this.addTrack(file));
                    }
                } catch (error) {
                    console.error('Error adding folder:', error);
                }
                return;
            }

            // Check for file drop
            const fileData = e.dataTransfer.getData('application/x-audio-file');
            if (fileData) {
                const draggedFileData = this.browser.getDraggedFileData();
                if (draggedFileData) {
                    const file = await this.browser.getFileObject(draggedFileData);
                    if (file) {
                        this.addTrack(file);
                    }
                }
                return;
            }

            // Check for native file drop
            if (e.dataTransfer.files.length > 0) {
                const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'];
                Array.from(e.dataTransfer.files).forEach(file => {
                    const isAudio = audioExtensions.some(ext =>
                        file.name.toLowerCase().endsWith(ext)
                    );
                    if (isAudio) {
                        this.addTrack(file);
                    }
                });
            }
        });
    }

    /**
     * Add track to playlist
     */
    addTrack(file) {
        // Check if already in playlist
        const exists = this.tracks.some(t =>
            t.file.name === file.name && t.file.size === file.size
        );
        if (exists) return;

        const track = {
            file: file,
            name: Utils.getFileNameWithoutExt(file.name),
            duration: null
        };

        this.tracks.push(track);
        this.render();

        // Get duration
        this.getTrackDuration(track, this.tracks.length - 1);
    }

    /**
     * Get track duration
     */
    getTrackDuration(track, index) {
        const audio = new Audio();
        audio.addEventListener('loadedmetadata', () => {
            track.duration = audio.duration;
            this.render();
            URL.revokeObjectURL(audio.src);
        });
        audio.src = URL.createObjectURL(track.file);
    }

    /**
     * Remove track from playlist
     */
    removeTrack(index) {
        this.tracks.splice(index, 1);
        if (this.currentPlayingIndex === index) {
            this.currentPlayingIndex = -1;
        } else if (this.currentPlayingIndex > index) {
            this.currentPlayingIndex--;
        }
        this.render();
    }

    /**
     * Clear playlist
     */
    clearPlaylist() {
        this.tracks = [];
        this.currentPlayingIndex = -1;
        this.render();
    }

    /**
     * Load track to deck
     */
    async loadToDeck(index, deckId) {
        const track = this.tracks[index];
        if (!track) {
            console.log('No track at index', index);
            return;
        }

        console.log('Loading track to deck', deckId, ':', track.name);

        try {
            // Use DeckController.loadFile() to update all UI (name, BPM, waveform, etc.)
            if (!window.djApp) {
                console.error('djApp not initialized');
                return;
            }
            const deckController = deckId === 'A' ? window.djApp.deckA : window.djApp.deckB;
            if (!deckController) {
                console.error('Deck controller not found for deck', deckId);
                return;
            }
            await deckController.loadFile(track.file);
            console.log('Track loaded successfully, removing from playlist');
            // Remove track from playlist after loading
            this.tracks.splice(index, 1);
            // Reset current playing index
            this.currentPlayingIndex = -1;
            this.render();
        } catch (error) {
            console.error('Error loading track:', error);
        }
    }

    /**
     * Load next track from playlist to deck
     */
    loadNextTrack(deckId) {
        if (this.tracks.length === 0) {
            console.log('Playlist is empty, nothing to load');
            return;
        }

        // Always load first track (index 0) since tracks are removed after loading
        const track = this.tracks[0];
        if (track) {
            console.log('Loading first track to deck', deckId, ':', track.name);
            this.loadToDeck(0, deckId);
        }
    }

    /**
     * Render playlist
     */
    render() {
        // Update count
        this.playlistCount.textContent = `${this.tracks.length} track${this.tracks.length !== 1 ? 's' : ''}`;

        if (this.tracks.length === 0) {
            this.playlistContent.innerHTML = `
                <div class="playlist-placeholder">
                    <span>Drag tracks here to add to playlist</span>
                </div>
            `;
            return;
        }

        let html = '';

        this.tracks.forEach((track, index) => {
            const isPlaying = index === this.currentPlayingIndex;
            const duration = track.duration
                ? Utils.formatTime(track.duration)
                : '--:--';

            html += `
                <div class="playlist-item ${isPlaying ? 'playing' : ''}"
                     data-index="${index}"
                     draggable="true">
                    <span class="playlist-number">${index + 1}</span>
                    <span class="playlist-name" title="${track.name}">${track.name}</span>
                    <span class="playlist-duration">${duration}</span>
                    <div class="playlist-actions">
                        <button class="load-deck-btn" data-deck="A" title="Load to Deck A">A</button>
                        <button class="load-deck-btn deck-b" data-deck="B" title="Load to Deck B">B</button>
                        <button class="remove-btn" title="Remove">&times;</button>
                    </div>
                </div>
            `;
        });

        this.playlistContent.innerHTML = html;

        // Add event listeners
        this.playlistContent.querySelectorAll('.playlist-item').forEach(item => {
            const index = parseInt(item.dataset.index);

            // Double click to load to deck A
            item.addEventListener('dblclick', () => {
                this.loadToDeck(index, 'A');
            });

            // Load buttons
            item.querySelectorAll('.load-deck-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.loadToDeck(index, btn.dataset.deck);
                });
            });

            // Remove button
            item.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTrack(index);
            });
        });
    }
}

/**
 * Browser Section Resizer
 * Allows resizing the browser section by dragging the top handle
 */
class BrowserResizer {
    constructor() {
        this.browserSection = document.getElementById('browserSection');
        this.resizeHandle = document.getElementById('browserResizeHandle');
        this.collapseBtn = document.getElementById('browserCollapseBtn');

        if (!this.browserSection || !this.resizeHandle) return;

        this.isResizing = false;
        this.startY = 0;
        this.startHeight = 0;
        this.minHeight = 100;
        this.maxHeight = window.innerHeight * 0.7;
        this.isCollapsed = false;

        // Load saved state
        const savedHeight = localStorage.getItem('browserSectionHeight');
        const savedCollapsed = localStorage.getItem('browserSectionCollapsed');

        if (savedCollapsed === 'true') {
            this.isCollapsed = true;
            this.browserSection.classList.add('collapsed');
        } else if (savedHeight) {
            this.browserSection.style.height = `${savedHeight}px`;
        }

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.resizeHandle.addEventListener('mousedown', this.startResize.bind(this));
        document.addEventListener('mousemove', this.resize.bind(this));
        document.addEventListener('mouseup', this.stopResize.bind(this));

        // Touch support
        this.resizeHandle.addEventListener('touchstart', this.startResizeTouch.bind(this));
        document.addEventListener('touchmove', this.resizeTouch.bind(this));
        document.addEventListener('touchend', this.stopResize.bind(this));

        // Collapse button
        if (this.collapseBtn) {
            this.collapseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleCollapse();
            });
        }

        // Update max height on window resize
        window.addEventListener('resize', () => {
            this.maxHeight = window.innerHeight * 0.7;
        });
    }

    toggleCollapse() {
        this.isCollapsed = !this.isCollapsed;

        if (this.isCollapsed) {
            this.browserSection.classList.add('collapsed');
        } else {
            this.browserSection.classList.remove('collapsed');
            // Restore saved height
            const savedHeight = localStorage.getItem('browserSectionHeight');
            if (savedHeight) {
                this.browserSection.style.height = `${savedHeight}px`;
            }
        }

        // Save collapsed state
        localStorage.setItem('browserSectionCollapsed', this.isCollapsed);
    }

    startResize(e) {
        // Don't resize when collapsed
        if (this.isCollapsed) return;

        // Don't start resize if clicking the collapse button
        if (e.target.closest('.browser-collapse-btn')) return;

        e.preventDefault();
        this.isResizing = true;
        this.startY = e.clientY;
        this.startHeight = this.browserSection.offsetHeight;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    }

    startResizeTouch(e) {
        // Don't resize when collapsed
        if (this.isCollapsed) return;

        if (e.touches.length === 1) {
            this.isResizing = true;
            this.startY = e.touches[0].clientY;
            this.startHeight = this.browserSection.offsetHeight;
        }
    }

    resize(e) {
        if (!this.isResizing) return;

        const deltaY = this.startY - e.clientY;
        const newHeight = Math.min(this.maxHeight, Math.max(this.minHeight, this.startHeight + deltaY));

        this.browserSection.style.height = `${newHeight}px`;
    }

    resizeTouch(e) {
        if (!this.isResizing || e.touches.length !== 1) return;

        const deltaY = this.startY - e.touches[0].clientY;
        const newHeight = Math.min(this.maxHeight, Math.max(this.minHeight, this.startHeight + deltaY));

        this.browserSection.style.height = `${newHeight}px`;
    }

    stopResize() {
        if (this.isResizing) {
            this.isResizing = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            // Save height
            const currentHeight = this.browserSection.offsetHeight;
            localStorage.setItem('browserSectionHeight', currentHeight);
        }
    }
}

// Initialize resizer when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    new BrowserResizer();
});

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FileBrowser, Playlist, BrowserResizer };
}
