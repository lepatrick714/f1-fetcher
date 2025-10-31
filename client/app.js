// F1 Race Telemetry Visualizer
class F1Visualizer {
    constructor() {
        this.canvas = document.getElementById('raceCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Set canvas to full screen
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        console.log('Canvas element:', this.canvas);
        console.log('Canvas context:', this.ctx);
        console.log('Canvas dimensions:', this.canvas.width, 'x', this.canvas.height);

        this.raceData = null;
        this.currentFrame = 0;
        this.maxFrames = 0;
        this.isPlaying = false;
        this.animationSpeed = 5;
        this.drivers = new Map();
        this.trackBounds = null;
        this.raceStartTime = null;
        this.colors = [
            '#FF1E1E', '#00D2BE', '#0078D4', '#FFB000', '#00C851',
            '#FF6900', '#AA00FF', '#FFC0CB', '#8B4513', '#DC143C',
            '#32CD32', '#4169E1', '#FF1493', '#00CED1', '#FF4500',
            '#9ACD32', '#FF69B4', '#87CEEB', '#DDA0DD', '#F0E68C'
        ];

        this.setupEventListeners();
        this.loadLasVegasRace(); // Load the Las Vegas race directly
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;

        // Redraw if we have data
        if (this.raceData) {
            this.draw();
        }
    }

    setupEventListeners() {
        // Control buttons
        document.getElementById('playBtn').addEventListener('click', () => this.play());
        document.getElementById('pauseBtn').addEventListener('click', () => this.pause());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());

        // Speed control
        const speedControl = document.getElementById('speedControl');
        const speedValue = document.getElementById('speedValue');
        speedControl.addEventListener('input', (e) => {
            this.animationSpeed = parseInt(e.target.value);
            speedValue.textContent = this.animationSpeed;
        });

        // Time scrubber
        const timeSlider = document.getElementById('timeSlider');
        timeSlider.addEventListener('input', (e) => {
            const sliderValue = parseInt(e.target.value);
            this.currentFrame = sliderValue; // Direct mapping since max is set to maxFrames

            // Update trails for scrubbing - rebuild trails up to current frame
            this.rebuildTrails();

            this.draw();
            this.updateTimeDisplay();
            this.updateProgress((this.currentFrame / this.maxFrames) * 100);
        });

        // Also add mousedown/mouseup to pause/resume during scrubbing
        timeSlider.addEventListener('mousedown', () => {
            this.wasPlayingBeforeScrub = this.isPlaying;
            this.pause();
        });

        timeSlider.addEventListener('mouseup', () => {
            if (this.wasPlayingBeforeScrub) {
                this.play();
            }
        });

        // Load cached race button
        document.getElementById('loadCachedBtn').addEventListener('click', () => {
            this.loadLasVegasRace();
        });

        // Update cached race select with Las Vegas option
        const cachedSelect = document.getElementById('cachedRaceSelect');
        cachedSelect.innerHTML = '<option value="las_vegas_2023">Las Vegas 2023 (Race)</option>';
        cachedSelect.value = 'las_vegas_2023';
    }

    async loadLasVegasRace() {
        try {
            this.updateStatus('Loading Las Vegas race data...');
            console.log('Attempting to fetch race data...');

            // Load the race data from the JSON file
            const response = await fetch('./f1_data/f1_race_Las_Vegas_9189.json');
            console.log('Fetch response:', response.status, response.statusText);

            if (!response.ok) {
                throw new Error(`Failed to load race data: ${response.status} ${response.statusText}`);
            }

            this.raceData = await response.json();
            console.log('Race data loaded:', this.raceData);
            console.log('Location data keys:', Object.keys(this.raceData.locationData || {}));

            this.processRaceData();
            this.updateStatus('Las Vegas race loaded successfully!');
            this.updateInfo();
            this.enableControls();
            this.reset(); // Initialize visualization

        } catch (error) {
            console.error('Error loading race:', error);
            this.updateStatus(`Error: ${error.message}`);

            // Try alternative path
            try {
                console.log('Trying alternative path...');
                const response2 = await fetch('f1_data/f1_race_Las_Vegas_9189.json');
                if (response2.ok) {
                    this.raceData = await response2.json();
                    console.log('Alternative path worked!');
                    this.processRaceData();
                    this.updateStatus('Las Vegas race loaded successfully!');
                    this.updateInfo();
                    this.enableControls();
                    this.reset();
                    return;
                }
            } catch (altError) {
                console.error('Alternative path also failed:', altError);
            }
        }
    }

    processRaceData() {
        console.log('Processing race data...');
        if (!this.raceData || !this.raceData.locationData) {
            console.error('No race data or location data found');
            return;
        }

        this.drivers.clear();
        let colorIndex = 0;
        this.maxFrames = 0;

        // Calculate track bounds for all axes
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        let earliestTime = null;

        console.log('Available drivers:', Object.keys(this.raceData.locationData));

        // Process each driver's location data
        for (const [driverNumber, locations] of Object.entries(this.raceData.locationData)) {
            if (!locations || locations.length === 0) {
                console.log(`Driver ${driverNumber}: No location data`);
                continue;
            }

            console.log(`Driver ${driverNumber}: ${locations.length} location points`);

            // Sort locations by time
            const sortedLocations = locations.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

            // Track earliest time
            if (sortedLocations.length > 0) {
                const driverStartTime = new Date(sortedLocations[0].date);
                if (!earliestTime || driverStartTime < earliestTime) {
                    earliestTime = driverStartTime;
                }
            }

            // Update track bounds for all dimensions
            for (const point of sortedLocations) {
                minX = Math.min(minX, point.x);
                maxX = Math.max(maxX, point.x);
                minY = Math.min(minY, point.y);
                maxY = Math.max(maxY, point.y);
                minZ = Math.min(minZ, point.z);
                maxZ = Math.max(maxZ, point.z);
            }

            this.drivers.set(parseInt(driverNumber), {
                number: parseInt(driverNumber),
                color: this.colors[colorIndex % this.colors.length],
                locations: sortedLocations,
                trail: []
            });

            this.maxFrames = Math.max(this.maxFrames, sortedLocations.length);
            colorIndex++;
        }

        // Decide which two axes to use based on largest ranges
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        const rangeZ = maxZ - minZ;

        const axes = [
            { key: 'x', range: rangeX, min: minX, max: maxX },
            { key: 'y', range: rangeY, min: minY, max: maxY },
            { key: 'z', range: rangeZ, min: minZ, max: maxZ },
        ].sort((a, b) => b.range - a.range);

        // Use the two dimensions with the largest spread
        this.axisH = axes[0].key; // horizontal axis
        this.axisV = axes[1].key; // vertical axis

        // Store track bounds (generic names for selected axes)
        this.trackBounds = {
            minH: axes[0].min,
            maxH: axes[0].max,
            minV: axes[1].min,
            maxV: axes[1].max,
        };
        this.raceStartTime = earliestTime;

        console.log(`Processed ${this.drivers.size} drivers, max frames: ${this.maxFrames}`);
        console.log(`Axis selection -> H: ${this.axisH} (${axes[0].range.toFixed(2)}), V: ${this.axisV} (${axes[1].range.toFixed(2)})`);
        console.log('Track bounds (selected axes):', this.trackBounds);
    }

    updateInfo() {
        if (!this.raceData) return;

        const info = document.getElementById('info');
        const session = this.raceData.sessionInfo;
        const driverCount = Object.keys(this.raceData.locationData).length;

        info.innerHTML = `
            <strong>${session.location} ${session.session_name}</strong> - ${session.year}<br>
            ${new Date(session.date_start).toLocaleDateString()} | 
            ${driverCount} drivers | 
            Circuit: ${session.circuit_short_name}
        `;
    }

    updateStatus(message) {
        const statusElement = document.getElementById('statusMessage');
        if (statusElement) {
            statusElement.textContent = message;
        }
        console.log(message);
    }

    enableControls() {
        document.getElementById('playBtn').disabled = false;
        document.getElementById('pauseBtn').disabled = false;
        document.getElementById('resetBtn').disabled = false;
        document.getElementById('speedControl').disabled = false;
        document.getElementById('timeSlider').disabled = false;

        // Set up time slider max value to actual frame count
        const timeSlider = document.getElementById('timeSlider');
        timeSlider.max = this.maxFrames - 1;
        timeSlider.value = 0;
    }

    play() {
        if (!this.raceData || this.isPlaying) return;

        this.isPlaying = true;
        this.animate();
    }

    pause() {
        this.isPlaying = false;
    }

    reset() {
        this.pause();
        this.currentFrame = 0;

        // Reset driver trails
        for (const driver of this.drivers.values()) {
            driver.trail = [];
        }

        // Reset time slider
        const timeSlider = document.getElementById('timeSlider');
        timeSlider.value = 0;

        this.draw();
        this.updateProgress(0);
        this.updateTimeDisplay();
    }

    rebuildTrails() {
        // Rebuild trails up to current frame for smooth scrubbing
        for (const driver of this.drivers.values()) {
            driver.trail = [];
            const startFrame = Math.max(0, this.currentFrame - 50); // Show last 50 points
            const endFrame = Math.min(this.currentFrame, driver.locations.length - 1);

            for (let i = startFrame; i <= endFrame; i += 2) { // Sample every other point for performance
                if (i < driver.locations.length) {
                    const point = driver.locations[i];
                    const canvasPos = this.trackToCanvas(point);
                    driver.trail.push(canvasPos);
                }
            }
        }
    }

    animate() {
        if (!this.isPlaying) return;

        this.currentFrame += this.animationSpeed;

        if (this.currentFrame >= this.maxFrames) {
            this.pause();
            this.updateStatus('Race replay completed!');
            return;
        }

        this.draw();
        this.updateProgress((this.currentFrame / this.maxFrames) * 100);
        this.updateTimeDisplay();

        // Update time slider
        const timeSlider = document.getElementById('timeSlider');
        timeSlider.value = this.currentFrame;

        requestAnimationFrame(() => this.animate());
    }

    draw() {
        console.log(`Drawing frame ${this.currentFrame}, drivers: ${this.drivers.size}`);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw track bounds (approximate)
        this.drawTrackBounds();

        // Draw each driver
        let driversDrawn = 0;
        for (const driver of this.drivers.values()) {
            this.drawDriver(driver);
            driversDrawn++;
        }

        console.log(`Drew ${driversDrawn} drivers`);

        // Update legend
        this.updateLegend();
    }

    drawTrackBounds() {
        if (!this.trackBounds) return;

        // Show the track drawing area bounds
        const leftPadding = 350;
        const topPadding = 200;
        const bottomPadding = 200;
        const rightPadding = 50;

        const canvasWidth = this.canvas.width - leftPadding - rightPadding;
        const canvasHeight = this.canvas.height - topPadding - bottomPadding;

        // Draw the available track area
        this.ctx.strokeStyle = '#30363d';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([10, 5]);
        this.ctx.strokeRect(leftPadding, topPadding, canvasWidth, canvasHeight);
        this.ctx.setLineDash([]);

        // Draw center lines for reference
        this.ctx.strokeStyle = '#1f2328';
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 2]);
        // Vertical center line
        this.ctx.beginPath();
        this.ctx.moveTo(leftPadding + canvasWidth / 2, topPadding);
        this.ctx.lineTo(leftPadding + canvasWidth / 2, topPadding + canvasHeight);
        this.ctx.stroke();
        // Horizontal center line  
        this.ctx.beginPath();
        this.ctx.moveTo(leftPadding, topPadding + canvasHeight / 2);
        this.ctx.lineTo(leftPadding + canvasWidth, topPadding + canvasHeight / 2);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawDriver(driver) {
        const frameIndex = Math.floor(this.currentFrame);
        if (frameIndex >= driver.locations.length) {
            console.log(`Driver ${driver.number}: frame ${frameIndex} >= ${driver.locations.length} locations`);
            return;
        }

        const point = driver.locations[frameIndex];
        if (!point) {
            console.log(`Driver ${driver.number}: no point at frame ${frameIndex}`);
            return;
        }

        // Convert track coordinates to canvas coordinates
        const canvasPos = this.trackToCanvas(point);

        // Debug the first few draws
        if (this.currentFrame < 5) {
            console.log(`Driver ${driver.number}: track pos (${point.x}, ${point.z}) -> canvas pos (${canvasPos.x}, ${canvasPos.y})`);
        }

        // Skip if position is invalid
        if (canvasPos.x < 0 || canvasPos.y < 0 || canvasPos.x > this.canvas.width || canvasPos.y > this.canvas.height) {
            console.log(`Driver ${driver.number}: position out of bounds (${canvasPos.x}, ${canvasPos.y})`);
            return;
        }

        // Add to trail only during normal playback
        if (this.isPlaying) {
            driver.trail.push(canvasPos);
            if (driver.trail.length > 100) {
                driver.trail.shift();
            }
        }
        // During scrubbing, trails are handled by rebuildTrails()

        // Draw trail
        if (driver.trail.length > 1) {
            this.ctx.strokeStyle = driver.color + '80'; // More visible trail
            this.ctx.lineWidth = 3;
            this.ctx.lineCap = 'round';
            this.ctx.beginPath();
            this.ctx.moveTo(driver.trail[0].x, driver.trail[0].y);
            for (let i = 1; i < driver.trail.length; i++) {
                this.ctx.lineTo(driver.trail[i].x, driver.trail[i].y);
            }
            this.ctx.stroke();
        }

        // Draw car (larger and more visible)
        this.ctx.fillStyle = driver.color;
        this.ctx.beginPath();
        this.ctx.arc(canvasPos.x, canvasPos.y, 8, 0, 2 * Math.PI);
        this.ctx.fill();

        // Add white border to car
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Draw driver number
        this.ctx.fillStyle = '#ffffff';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        // Add text background for better readability
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(canvasPos.x - 12, canvasPos.y - 18, 24, 16);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillText(driver.number.toString(), canvasPos.x, canvasPos.y - 10);
    }
    trackToCanvas(point) {
        if (!this.trackBounds) return { x: 0, y: 0 };

        // Much smaller padding to use more canvas space
        const leftPadding = 100;
        const topPadding = 50;
        const bottomPadding = 50;
        const rightPadding = 100;

        const canvasWidth = this.canvas.width - leftPadding - rightPadding;
        const canvasHeight = this.canvas.height - topPadding - bottomPadding;

        // Get values from the dynamically selected axes
        const hVal = point[this.axisH];
        const vVal = point[this.axisV];

        // Calculate ranges
        const rangeH = this.trackBounds.maxH - this.trackBounds.minH;
        const rangeV = this.trackBounds.maxV - this.trackBounds.minV;

        // Scale to fit canvas while maintaining aspect ratio
        const scaleH = canvasWidth / rangeH;
        const scaleV = canvasHeight / rangeV;

        // Use the smaller scale to fit everything, use 95% of available space
        const scale = Math.min(scaleH, scaleV) * 0.95;

        // Calculate scaled dimensions
        const scaledWidth = rangeH * scale;
        const scaledHeight = rangeV * scale;

        // Center the track
        const offsetH = (canvasWidth - scaledWidth) / 2;
        const offsetV = (canvasHeight - scaledHeight) / 2;

        // Transform coordinates
        const normalizedH = (hVal - this.trackBounds.minH) / rangeH;
        const normalizedV = (vVal - this.trackBounds.minV) / rangeV;

        return {
            x: leftPadding + offsetH + normalizedH * scaledWidth,
            y: topPadding + offsetV + normalizedV * scaledHeight
        };
    }

    updateTimeDisplay() {
        if (!this.raceStartTime || !this.drivers.size) return;

        // Find the current time based on current frame
        let currentTime = null;
        for (const driver of this.drivers.values()) {
            if (this.currentFrame < driver.locations.length) {
                const point = driver.locations[Math.floor(this.currentFrame)];
                if (point && point.date) {
                    currentTime = new Date(point.date);
                    break;
                }
            }
        }

        if (!currentTime) {
            document.getElementById('timeDisplay').textContent = '00:00:00';
            return;
        }

        // Calculate elapsed time since race start
        const elapsedMs = currentTime.getTime() - this.raceStartTime.getTime();
        const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

        const hours = Math.floor(elapsedSeconds / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        const seconds = elapsedSeconds % 60;

        const timeStr = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('timeDisplay').textContent = timeStr;
    }

    updateProgress(percentage) {
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = `${percentage}%`;
            progressFill.textContent = `${Math.round(percentage)}%`;
        }
    }

    updateLegend() {
        const legend = document.getElementById('legend');
        if (!legend || this.drivers.size === 0) return;

        const driverList = Array.from(this.drivers.values())
            .sort((a, b) => a.number - b.number)
            .map(driver => `
                <div class="legend-item">
                    <div class="legend-color" style="background-color: ${driver.color}"></div>
                    <span>#${driver.number}</span>
                </div>
            `).join('');

        legend.innerHTML = `<h3>Drivers</h3><div class="legend-grid">${driverList}</div>`;
    }
}

// Initialize the visualizer when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new F1Visualizer();
});