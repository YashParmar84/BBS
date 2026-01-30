const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'technomatra logo.jpeg');
const dest1 = path.join(__dirname, 'public', 'logo.jpg');
const dest2 = path.join(__dirname, 'public', 'bg.jpg');

try {
    fs.copyFileSync(src, dest1);
    console.log('Copied to logo.jpg');
    fs.copyFileSync(src, dest2);
    console.log('Copied to bg.jpg');
} catch (err) {
    console.error('Error:', err.message);
}
