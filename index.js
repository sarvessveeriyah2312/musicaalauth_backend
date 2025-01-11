const express = require('express');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const cors = require('cors');

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.json());
app.use(cors()); // Enable CORS for all routes

// MySQL Connection
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
});

db.connect((err) => {
    if (err) {
        console.error('Error connecting to MySQL database:', err.message);
        process.exit(1);
    } else {
        console.log('Connected to MySQL database.');
    }
});

// **Register a New User**
app.post('/register', (req, res) => {
    const { username, gestureSequence } = req.body;

    if (!username || !gestureSequence) {
        return res.status(400).json({ message: 'Username and gesture sequence are required.' });
    }

    const query = 'INSERT INTO users (username, gesture_sequence) VALUES (?, ?)';
    db.query(query, [username, gestureSequence], (err, results) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ message: 'Username already exists.' });
            }
            return res.status(500).json({ message: 'Error registering user.', error: err.message });
        }
        res.status(201).json({ message: 'User registered successfully!' });
    });
});


app.post('/login', (req, res) => {
    const { gestureSequence } = req.body;

    if (!gestureSequence) {
        return res.status(400).json({ message: 'Gesture sequence is required.' });
    }

    const query = 'SELECT * FROM users WHERE gesture_sequence = ?';
    db.query(query, [gestureSequence], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching user.', error: err.message });
        }

        if (results.length === 0) {
            return res.status(404).json({ message: 'Gesture sequence not found.' });
        }

        const user = results[0];

        // Generate JWT token
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        // Include user details in the response
        res.json({
            message: 'Login successful!',
            token,
            user: {
                id: user.id,
                username: user.username,
                gestureSequence: user.gesture_sequence,
            },
        });
    });
});

app.get('/gestures/:userId', (req, res) => {
    const { userId } = req.params;

    const query = 'SELECT gesture, tone FROM gesture_mapping WHERE user_id = ?';
    db.query(query, [userId], (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Error fetching gestures.', error: err.message });
        }

        res.json({
            message: 'Gesture mappings retrieved successfully!',
            userId,
            gestures: results,
        });
    });
});

// **Randomize Gesture Mappings After Login**
app.post('/randomize-gestures/:userId', (req, res) => {
    const { userId } = req.params;
    const gestures = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
    const tones = ['C', 'D', 'E', 'F'];


    const shuffledTones = tones.sort(() => Math.random() - 0.5);
    const mappings = gestures.map((gesture, index) => ({
        gesture,
        tone: shuffledTones[index],
    }));

    const deleteQuery = 'DELETE FROM gesture_mapping WHERE user_id = ?';
    db.query(deleteQuery, [userId], (err) => {
        if (err) {
            return res.status(500).json({ message: 'Error clearing old mappings.', error: err.message });
        }

        const insertQuery = 'INSERT INTO gesture_mapping (user_id, gesture, tone) VALUES ?';
        const values = mappings.map((map) => [userId, map.gesture, map.tone]);

        db.query(insertQuery, [values], (err) => {
            if (err) {
                return res.status(500).json({ message: 'Error saving mappings.', error: err.message });
            }
            res.json({
                message: 'Gesture mappings randomized successfully!',
                userId,
                mappings,
            });
        });
    });
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
