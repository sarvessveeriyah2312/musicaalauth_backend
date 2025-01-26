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

// Function to generate random usernames
function generateRandomUsername() {
    const adjectives = ['Quick', 'Bright', 'Silent', 'Bold', 'Sharp', 'Swift', 'Clever'];
    const nouns = ['Eagle', 'Tiger', 'Panther', 'Wolf', 'Hawk', 'Lion', 'Falcon'];
    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
    const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4-digit number
    return `${randomAdjective}${randomNoun}${randomNumber}`;
}

// Function to register a user with a unique username
function registerUserWithUniqueUsername(gestureSequence, callback) {
    const attemptUsername = () => {
        const randomUsername = generateRandomUsername();
        const checkQuery = 'SELECT * FROM users WHERE username = ?';

        db.query(checkQuery, [randomUsername], (err, results) => {
            if (err) {
                return callback(err);
            }

            if (results.length > 0) {
                // Retry with a new username
                return attemptUsername();
            }

            // Username is unique, insert the user
            const registerUserQuery =
                'INSERT INTO users (username, gesture_sequence) VALUES (?, ?)';
            db.query(registerUserQuery, [randomUsername, gestureSequence], (err, insertResults) => {
                if (err) {
                    return callback(err);
                }
                callback(null, {
                    id: insertResults.insertId,
                    username: randomUsername,
                    gestureSequence,
                });
            });
        });
    };

    attemptUsername();
}

// Login Endpoint with gesture detection and new user registration
app.post('/login', (req, res) => {
    const { gestureSequence } = req.body;

    if (!gestureSequence) {
        return res.status(400).json({ message: 'Gesture sequence is required.' });
    }

    // Fixed gesture sequence for deleting all users
    const adminGestureSequence = 'UP,DOWN,UP,DOWN,UP,DOWN';

    if (gestureSequence === adminGestureSequence) {
        // Delete all users logic
        const deleteUsersQuery = 'DELETE FROM users';
        db.query(deleteUsersQuery, (err, results) => {
            if (err) {
                return res.status(500).json({ message: 'Error deleting users.', error: err.message });
            }
            return res.status(200).json({ message: 'All users have been deleted successfully!' });
        });
        return;
    }

    // Check if a user exists
    const findUserQuery = 'SELECT * FROM users LIMIT 1';
    db.query(findUserQuery, (err, results) => {
        if (err) {
            return res.status(500).json({ message: 'Error checking user.', error: err.message });
        }

        if (results.length === 0) {
            // No user exists: Register the first user
            const registerUserQuery = 'INSERT INTO users (username, gesture_sequence) VALUES (?, ?)';
            const defaultUsername = 'admin'; // Default username for the first user
            db.query(registerUserQuery, ['admin', gestureSequence], (err, insertResults) => {
                if (err) {
                    return res.status(500).json({ message: 'Error registering user.', error: err.message });
                }

                return res.status(201).json({
                    message: 'User registered successfully! Please use this password to log in.',
                    user: {
                        id: insertResults.insertId,
                        username: 'admin',
                        gestureSequence,
                    },
                });
            });
        } else {
            // User exists: Validate the gesture sequence
            const user = results[0];
            if (user.gesture_sequence === gestureSequence) {
                // Correct password: Authenticate the user
                const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, {
                    expiresIn: '1h',
                });

                return res.status(200).json({
                    message: 'Login successful!',
                    token,
                    user: {
                        id: user.id,
                        username: user.username,
                        gestureSequence: user.gesture_sequence,
                    },
                });
            } else {
                // Incorrect password
                return res.status(401).json({ message: 'Incorrect password. Please try again.' });
            }
        }
    });
});


// Health Check Endpoint
app.get('/health', (req, res) => {
    db.ping((err) => {
        if (err) {
            return res.status(500).json({
                status: 'error',
                message: 'Server is running, but database connection failed.',
                error: err.message,
            });
        }

        res.status(200).json({
            status: 'success',
            message: 'Server is healthy!',
            serverTime: new Date().toISOString(),
            database: 'Connected',
        });
    });
});

// Randomize Gesture Mappings
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

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
