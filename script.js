class SoundPadPro {
    constructor() {
        this.audioContext = null;
        this.masterGainNode = null;
        this.pads = new Map();
        this.playlist = [];
        this.activeEffects = new Set();
        this.isRecording = false;
        this.metronomeInterval = null;
        this.recordingMedia = null;
        this.recordedChunks = [];
        this.settings = {
            theme: 'dark',
            audioQuality: 'medium',
            autoSave: true,
            showTooltips: true
        };
        
        this.init();
    }

    async init() {
        await this.initAudioContext();
        this.loadSettings();
        this.loadSavedData();
        this.setupEventListeners();
        this.createDefaultPads();
        this.updateVUMeters();
        this.setupKeyboardShortcuts();
    }

    async initAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.masterGainNode = this.audioContext.createGain();
            this.masterGainNode.connect(this.audioContext.destination);
            this.masterGainNode.gain.value = 0.75;
            
            // Create analyser for VU meters
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.masterGainNode.connect(this.analyser);
            
            // Create EQ filters
            this.createEQFilters();
            
        } catch (error) {
            console.error('Erro ao inicializar contexto de áudio:', error);
            this.showNotification('Erro ao inicializar áudio. Verifique as permissões do navegador.', 'error');
        }
    }

    createEQFilters() {
        this.eqFilters = {};
        const frequencies = [60, 250, 1000, 3500, 10000];
        
        frequencies.forEach(freq => {
            const filter = this.audioContext.createBiquadFilter();
            filter.type = freq >= 1000 ? 'highshelf' : 'lowshelf';
            filter.frequency.value = freq;
            filter.gain.value = 0;
            
            if (!this.eqChain) {
                this.eqChain = filter;
            } else {
                this.lastEQFilter.connect(filter);
            }
            this.lastEQFilter = filter;
            this.eqFilters[freq] = filter;
        });
        
        this.lastEQFilter.connect(this.masterGainNode);
    }

    setupEventListeners() {
        // Master volume
        const masterVolume = document.getElementById('masterVolume');
        masterVolume.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            this.masterGainNode.gain.value = volume;
            e.target.nextElementSibling.textContent = `${e.target.value}%`;
        });

        // EQ controls
        document.querySelectorAll('.eq-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const freq = parseInt(e.target.dataset.freq);
                const gain = parseFloat(e.target.value);
                this.eqFilters[freq].gain.value = gain;
                e.target.nextElementSibling.textContent = `${gain > 0 ? '+' : ''}${gain}dB`;
            });
        });

        // Effects
        document.querySelectorAll('.effect-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const effect = e.currentTarget.dataset.effect;
                this.toggleEffect(effect, e.currentTarget);
            });
        });

        // Pad controls
        document.getElementById('addPadBtn').addEventListener('click', () => this.showUploadModal());
        document.getElementById('clearAllBtn').addEventListener('click', () => this.clearAllPads());

        // File upload
        const loadSoundBtn = document.getElementById('loadSoundBtn');
        const fileInput = document.getElementById('fileInput');
        
        loadSoundBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => this.handleFileUpload(e.target.files));

        // Recording
        document.getElementById('recordBtn').addEventListener('click', () => this.toggleRecording());
        document.getElementById('metronomeBtn').addEventListener('click', () => this.toggleMetronome());

        // BPM control
        const bpmSlider = document.getElementById('bpmSlider');
        const bpmValue = document.getElementById('bpmValue');
        bpmSlider.addEventListener('input', (e) => {
            bpmValue.textContent = e.target.value;
            if (this.metronomeInterval) {
                this.stopMetronome();
                this.startMetronome(parseInt(e.target.value));
            }
        });

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => this.showSettingsModal());
        document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());

        // Modal controls
        this.setupModalControls();
    }

    setupModalControls() {
        // Upload modal
        const uploadModal = document.getElementById('uploadModal');
        const cancelUpload = document.getElementById('cancelUpload');
        const confirmUpload = document.getElementById('confirmUpload');
        
        cancelUpload.addEventListener('click', () => this.closeModal('uploadModal'));
        confirmUpload.addEventListener('click', () => this.confirmPadCreation());

        // Settings modal
        const settingsModal = document.getElementById('settingsModal');
        const saveSettings = document.getElementById('saveSettings');
        
        saveSettings.addEventListener('click', () => this.saveSettings());

        // Modal close buttons
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modal = e.target.closest('.modal');
                this.closeModal(modal.id);
            });
        });

        // Color picker
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });

        // Hotkey input
        const hotkeyInput = document.getElementById('hotkey');
        hotkeyInput.addEventListener('keydown', (e) => {
            e.preventDefault();
            hotkeyInput.value = e.key.toUpperCase();
        });

        // Close modal on outside click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    this.closeModal(modal.id);
                }
            });
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            
            const key = e.key.toUpperCase();
            
            // Check if key matches any pad hotkey
            this.pads.forEach((pad, id) => {
                if (pad.hotkey === key) {
                    e.preventDefault();
                    this.playPad(id);
                }
            });

            // Global shortcuts
            if (e.ctrlKey || e.metaKey) {
                switch(key) {
                    case 'S':
                        e.preventDefault();
                        this.saveToLocalStorage();
                        break;
                    case 'O':
                        e.preventDefault();
                        document.getElementById('fileInput').click();
                        break;
                    case 'R':
                        e.preventDefault();
                        this.toggleRecording();
                        break;
                }
            }

            // Spacebar to stop all sounds
            if (key === ' ') {
                e.preventDefault();
                this.stopAllSounds();
            }
        });
    }

    createDefaultPads() {
        const defaultPads = [
            { name: 'Kick', color: '#ff6b6b', icon: 'fa-drum' },
            { name: 'Snare', color: '#4ecdc4', icon: 'fa-drum-steelpan' },
            { name: 'Hi-Hat', color: '#45b7d1', icon: 'fa-compact-disc' },
            { name: 'Clap', color: '#96ceb4', icon: 'fa-hands-clapping' }
        ];

        defaultPads.forEach((padData, index) => {
            const padId = `pad-${Date.now()}-${index}`;
            this.createPad(padId, padData);
        });
    }

    createPad(id, data) {
        const pad = {
            id,
            name: data.name || 'Sem nome',
            color: data.color || '#4ecdc4',
            icon: data.icon || 'fa-music',
            audioBuffer: data.audioBuffer || null,
            audioFile: data.audioFile || null,
            hotkey: data.hotkey || '',
            loop: data.loop || false,
            isPlaying: false,
            source: null
        };

        this.pads.set(id, pad);
        this.renderPad(pad);
        
        if (this.settings.autoSave) {
            this.saveToLocalStorage();
        }
    }

    renderPad(pad) {
        const padsGrid = document.getElementById('padsGrid');
        const padElement = document.createElement('div');
        padElement.className = 'pad';
        padElement.id = pad.id;
        padElement.style.background = `linear-gradient(135deg, ${pad.color}dd, ${pad.color}99)`;
        
        padElement.innerHTML = `
            <div class="pad-hotkey">${pad.hotkey}</div>
            <i class="fas ${pad.icon} pad-icon"></i>
            <div class="pad-name">${pad.name}</div>
            <div class="pad-controls">
                <button class="pad-control-btn" onclick="soundPad.togglePadLoop('${pad.id}')" title="Loop">
                    <i class="fas ${pad.loop ? 'fa-repeat' : 'fa-arrow-right'}"></i>
                </button>
                <button class="pad-control-btn" onclick="soundPad.deletePad('${pad.id}')" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        padElement.addEventListener('click', (e) => {
            if (!e.target.closest('.pad-controls')) {
                this.playPad(pad.id);
            }
        });

        padsGrid.appendChild(padElement);
    }

    async playPad(padId) {
        const pad = this.pads.get(padId);
        if (!pad || !pad.audioBuffer) return;

        // Stop current sound if playing
        if (pad.source) {
            pad.source.stop();
            pad.source = null;
        }

        // Create new audio source
        const source = this.audioContext.createBufferSource();
        source.buffer = pad.audioBuffer;
        source.loop = pad.loop;

        // Connect to EQ chain if available, otherwise directly to master
        if (this.eqChain) {
            source.connect(this.eqChain);
        } else {
            source.connect(this.masterGainNode);
        }

        // Apply effects
        this.applyEffects(source);

        source.start(0);
        pad.source = source;
        pad.isPlaying = true;

        // Update UI
        const padElement = document.getElementById(padId);
        padElement.classList.add('playing');

        source.onended = () => {
            if (!pad.loop) {
                pad.isPlaying = false;
                pad.source = null;
                padElement.classList.remove('playing');
            }
        };
    }

    stopPad(padId) {
        const pad = this.pads.get(padId);
        if (!pad || !pad.source) return;

        pad.source.stop();
        pad.source = null;
        pad.isPlaying = false;

        const padElement = document.getElementById(padId);
        padElement.classList.remove('playing');
    }

    stopAllSounds() {
        this.pads.forEach((pad, id) => {
            this.stopPad(id);
        });
    }

    togglePadLoop(padId) {
        const pad = this.pads.get(padId);
        if (!pad) return;

        pad.loop = !pad.loop;
        
        const padElement = document.getElementById(padId);
        const loopBtn = padElement.querySelector('.pad-control-btn i');
        loopBtn.className = `fas ${pad.loop ? 'fa-repeat' : 'fa-arrow-right'}`;
        
        if (this.settings.autoSave) {
            this.saveToLocalStorage();
        }
    }

    deletePad(padId) {
        this.stopPad(padId);
        this.pads.delete(padId);
        
        const padElement = document.getElementById(padId);
        padElement.remove();
        
        if (this.settings.autoSave) {
            this.saveToLocalStorage();
        }
    }

    clearAllPads() {
        if (confirm('Tem certeza que deseja remover todos os pads?')) {
            this.stopAllSounds();
            this.pads.clear();
            document.getElementById('padsGrid').innerHTML = '';
            
            if (this.settings.autoSave) {
                this.saveToLocalStorage();
            }
        }
    }

    async handleFileUpload(files) {
        for (const file of files) {
            if (file.type.startsWith('audio/')) {
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                    
                    const padData = {
                        name: file.name.replace(/\.[^/.]+$/, ''),
                        audioBuffer,
                        audioFile: file.name,
                        icon: 'fa-music'
                    };
                    
                    const padId = `pad-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    this.createPad(padId, padData);
                    
                    // Add to playlist
                    this.addToPlaylist(padData);
                    
                } catch (error) {
                    console.error('Erro ao carregar arquivo de áudio:', error);
                    this.showNotification(`Erro ao carregar ${file.name}`, 'error');
                }
            }
        }
    }

    showUploadModal() {
        document.getElementById('uploadModal').classList.add('active');
        document.getElementById('soundName').value = '';
        document.getElementById('hotkey').value = '';
        document.getElementById('loopCheckbox').checked = false;
        
        // Select first color by default
        document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('selected'));
        document.querySelector('.color-btn').classList.add('selected');
    }

    confirmPadCreation() {
        const name = document.getElementById('soundName').value || 'Sem nome';
        const hotkey = document.getElementById('hotkey').value;
        const loop = document.getElementById('loopCheckbox').checked;
        const selectedColor = document.querySelector('.color-btn.selected');
        const color = selectedColor ? selectedColor.dataset.color : '#4ecdc4';
        
        const padData = {
            name,
            color,
            hotkey,
            loop,
            icon: 'fa-music'
        };
        
        const padId = `pad-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.createPad(padId, padData);
        
        this.closeModal('uploadModal');
        this.showNotification('Pad criado com sucesso! Adicione um arquivo de áudio.', 'success');
    }

    addToPlaylist(audioData) {
        const playlistItem = {
            id: `playlist-${Date.now()}`,
            ...audioData,
            duration: '0:00'
        };
        
        this.playlist.push(playlistItem);
        this.renderPlaylist();
    }

    renderPlaylist() {
        const playlistElement = document.getElementById('playlist');
        playlistElement.innerHTML = '';
        
        this.playlist.forEach(item => {
            const itemElement = document.createElement('div');
            itemElement.className = 'playlist-item';
            itemElement.innerHTML = `
                <div class="playlist-info">
                    <i class="fas fa-music playlist-icon"></i>
                    <span class="playlist-name">${item.name}</span>
                    <span class="playlist-duration">${item.duration}</span>
                </div>
                <div class="playlist-actions">
                    <button class="playlist-action-btn" onclick="soundPad.playFromPlaylist('${item.id}')" title="Tocar">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="playlist-action-btn" onclick="soundPad.removeFromPlaylist('${item.id}')" title="Remover">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            playlistElement.appendChild(itemElement);
        });
    }

    playFromPlaylist(itemId) {
        const item = this.playlist.find(i => i.id === itemId);
        if (item && item.audioBuffer) {
            const padData = {
                name: item.name,
                audioBuffer: item.audioBuffer,
                color: item.color || '#4ecdc4',
                icon: 'fa-music'
            };
            
            const padId = `temp-${Date.now()}`;
            this.createPad(padId, padData);
            this.playPad(padId);
        }
    }

    removeFromPlaylist(itemId) {
        this.playlist = this.playlist.filter(item => item.id !== itemId);
        this.renderPlaylist();
        
        if (this.settings.autoSave) {
            this.saveToLocalStorage();
        }
    }

    toggleEffect(effect, button) {
        if (this.activeEffects.has(effect)) {
            this.activeEffects.delete(effect);
            button.classList.remove('active');
        } else {
            this.activeEffects.add(effect);
            button.classList.add('active');
        }
    }

    applyEffects(source) {
        let lastNode = source;
        
        this.activeEffects.forEach(effect => {
            let effectNode;
            
            switch(effect) {
                case 'reverb':
                    effectNode = this.createReverb();
                    break;
                case 'delay':
                    effectNode = this.createDelay();
                    break;
                case 'distortion':
                    effectNode = this.createDistortion();
                    break;
                case 'compressor':
                    effectNode = this.audioContext.createDynamicsCompressor();
                    break;
            }
            
            if (effectNode) {
                lastNode.connect(effectNode);
                effectNode.connect(this.masterGainNode);
                lastNode = effectNode;
            }
        });
    }

    createReverb() {
        const convolver = this.audioContext.createConvolver();
        const length = this.audioContext.sampleRate * 2;
        const impulse = this.audioContext.createBuffer(2, length, this.audioContext.sampleRate);
        
        for (let channel = 0; channel < 2; channel++) {
            const channelData = impulse.getChannelData(channel);
            for (let i = 0; i < length; i++) {
                channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
            }
        }
        
        convolver.buffer = impulse;
        return convolver;
    }

    createDelay() {
        const delay = this.audioContext.createDelay(1.0);
        delay.delayTime.value = 0.3;
        
        const feedback = this.audioContext.createGain();
        feedback.gain.value = 0.4;
        
        const wetGain = this.audioContext.createGain();
        wetGain.gain.value = 0.3;
        
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(wetGain);
        
        return { connect: (node) => delay.connect(node), wetGain };
    }

    createDistortion() {
        const distortion = this.audioContext.createWaveShaper();
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + 10) * x * 20 * deg) / (Math.PI + 10 * Math.abs(x));
        }
        
        distortion.curve = curve;
        distortion.oversample = '4x';
        return distortion;
    }

    async toggleRecording() {
        if (!this.isRecording) {
            await this.startRecording();
        } else {
            this.stopRecording();
        }
    }

    async startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.recordingMedia = new MediaRecorder(stream);
            this.recordedChunks = [];
            
            this.recordingMedia.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.recordingMedia.onstop = () => {
                const blob = new Blob(this.recordedChunks, { type: 'audio/webm' });
                this.saveRecording(blob);
            };
            
            this.recordingMedia.start();
            this.isRecording = true;
            
            const recordBtn = document.getElementById('recordBtn');
            recordBtn.classList.add('recording');
            recordBtn.innerHTML = '<i class="fas fa-stop"></i> Parar';
            
            this.showNotification('Gravação iniciada', 'success');
            
        } catch (error) {
            console.error('Erro ao iniciar gravação:', error);
            this.showNotification('Erro ao iniciar gravação. Verifique as permissões do microfone.', 'error');
        }
    }

    stopRecording() {
        if (this.recordingMedia && this.isRecording) {
            this.recordingMedia.stop();
            this.recordingMedia.stream.getTracks().forEach(track => track.stop());
            this.isRecording = false;
            
            const recordBtn = document.getElementById('recordBtn');
            recordBtn.classList.remove('recording');
            recordBtn.innerHTML = '<i class="fas fa-circle"></i> Gravar';
            
            this.showNotification('Gravação finalizada', 'success');
        }
    }

    saveRecording(blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `soundpad-recording-${Date.now()}.webm`;
        a.click();
        URL.revokeObjectURL(url);
    }

    toggleMetronome() {
        const metronomeBtn = document.getElementById('metronomeBtn');
        const bpm = parseInt(document.getElementById('bpmSlider').value);
        
        if (this.metronomeInterval) {
            this.stopMetronome();
            metronomeBtn.classList.remove('active');
        } else {
            this.startMetronome(bpm);
            metronomeBtn.classList.add('active');
        }
    }

    startMetronome(bpm) {
        const interval = 60000 / bpm;
        
        const tick = () => {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.frequency.value = 800;
            oscillator.type = 'sine';
            
            gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
            
            oscillator.connect(gainNode);
            gainNode.connect(this.masterGainNode);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.1);
        };
        
        tick(); // Immediate first tick
        this.metronomeInterval = setInterval(tick, interval);
    }

    stopMetronome() {
        if (this.metronomeInterval) {
            clearInterval(this.metronomeInterval);
            this.metronomeInterval = null;
        }
    }

    updateVUMeters() {
        const update = () => {
            if (this.analyser) {
                const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
                this.analyser.getByteFrequencyData(dataArray);
                
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                const normalizedLevel = average / 255;
                
                const leftBar = document.querySelector('.vu-bar.left');
                const rightBar = document.querySelector('.vu-bar.right');
                
                if (leftBar && rightBar) {
                    const height = Math.max(10, normalizedLevel * 100);
                    leftBar.style.height = `${height}%`;
                    rightBar.style.height = `${height}%`;
                }
            }
            
            requestAnimationFrame(update);
        };
        
        update();
    }

    showSettingsModal() {
        const modal = document.getElementById('settingsModal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        document.getElementById('themeSelect').value = this.settings.theme;
        document.getElementById('audioQuality').value = this.settings.audioQuality;
        document.getElementById('autoSave').checked = this.settings.autoSave;
        document.getElementById('showTooltips').checked = this.settings.showTooltips;
    }

    saveSettings() {
        this.settings.theme = document.getElementById('themeSelect').value;
        this.settings.audioQuality = document.getElementById('audioQuality').value;
        this.settings.autoSave = document.getElementById('autoSave').checked;
        this.settings.showTooltips = document.getElementById('showTooltips').checked;
        
        // Apply theme
        document.body.className = this.settings.theme === 'light' ? 'light-theme' : '';
        
        localStorage.setItem('soundpad-settings', JSON.stringify(this.settings));
        this.closeModal('settingsModal');
        this.showNotification('Configurações salvas', 'success');
    }

    loadSettings() {
        const saved = localStorage.getItem('soundpad-settings');
        if (saved) {
            this.settings = { ...this.settings, ...JSON.parse(saved) };
            document.body.className = this.settings.theme === 'light' ? 'light-theme' : '';
        }
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen();
        } else {
            document.exitFullscreen();
        }
    }

    saveToLocalStorage() {
        const data = {
            pads: Array.from(this.pads.entries()).map(([id, pad]) => ({
                id,
                name: pad.name,
                color: pad.color,
                icon: pad.icon,
                hotkey: pad.hotkey,
                loop: pad.loop
            })),
            playlist: this.playlist
        };
        
        localStorage.setItem('soundpad-data', JSON.stringify(data));
    }

    loadSavedData() {
        const saved = localStorage.getItem('soundpad-data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                
                // Recreate pads
                if (data.pads) {
                    data.pads.forEach(padData => {
                        this.createPad(padData.id, padData);
                    });
                }
                
                // Recreate playlist
                if (data.playlist) {
                    this.playlist = data.playlist;
                    this.renderPlaylist();
                }
                
            } catch (error) {
                console.error('Erro ao carregar dados salvos:', error);
            }
        }
    }

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 1rem 1.5rem;
            background: ${type === 'error' ? 'var(--danger)' : type === 'success' ? 'var(--success)' : 'var(--accent-primary)'};
            color: white;
            border-radius: var(--radius-md);
            z-index: 10000;
            animation: slideIn 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }
}

// Initialize the application
let soundPad;
document.addEventListener('DOMContentLoaded', () => {
    soundPad = new SoundPadPro();
});

// Add notification animations to CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
    }
    
    @keyframes slideOut {
        from { transform: translateX(0); opacity: 1; }
        to { transform: translateX(100%); opacity: 0; }
    }
`;
document.head.appendChild(style);
