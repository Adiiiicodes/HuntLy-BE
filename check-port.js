// check-port.js - Find what's using port 6969
const { exec } = require('child_process');
const os = require('os');

const port = process.argv[2] || 6969;

console.log(`Checking what's using port ${port}...\n`);

if (os.platform() === 'win32') {
    // Windows command
    exec(`netstat -ano | findstr :${port}`, (error, stdout, stderr) => {
        if (error) {
            console.log(`Port ${port} appears to be free.`);
            return;
        }
        
        console.log('Port usage found:');
        console.log(stdout);
        
        // Extract PIDs
        const lines = stdout.trim().split('\n');
        const pids = new Set();
        
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            const pid = parts[parts.length - 1];
            if (pid && !isNaN(pid)) {
                pids.add(pid);
            }
        });
        
        if (pids.size > 0) {
            console.log('\nProcess IDs using this port:', Array.from(pids).join(', '));
            console.log('\nTo kill these processes, run:');
            pids.forEach(pid => {
                console.log(`taskkill /F /PID ${pid}`);
            });
        }
    });
} else {
    // Linux/Mac command
    exec(`lsof -i :${port}`, (error, stdout, stderr) => {
        if (error) {
            console.log(`Port ${port} appears to be free.`);
            return;
        }
        
        console.log('Port usage found:');
        console.log(stdout);
        
        // Extract PIDs
        const lines = stdout.trim().split('\n').slice(1); // Skip header
        const pids = new Set();
        
        lines.forEach(line => {
            const parts = line.trim().split(/\s+/);
            if (parts[1] && !isNaN(parts[1])) {
                pids.add(parts[1]);
            }
        });
        
        if (pids.size > 0) {
            console.log('\nTo kill these processes, run:');
            pids.forEach(pid => {
                console.log(`kill -9 ${pid}`);
            });
        }
    });
}