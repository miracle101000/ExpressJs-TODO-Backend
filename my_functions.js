import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import dotenv from 'dotenv'

dotenv.config()
const jwt_secret_key = process.env.JWT_SECRET_KEY

///Verify Token
export function verifyToken(req, res, next) {
    const token = req.headers.authorization

    if (!token) {
        // If token is not provided, return 401 Unauthorized
        return res.status(401).send('Unauthorized');
    }

    // Verify the token
    jwt.verify(token.replace(/Bearer/, '').trim(), jwt_secret_key, (err, decoded) => {
        if (err) {
            // If token is expired, return 401 Unauthorized with specific message
            if (err.name === 'TokenExpiredError') {
                return res.status(401).send('Token expired');
            }
            // If token is invalid for other reasons, return 401 Unauthorized
            return res.status(401).send('Unauthorized');
        }
        // If token is valid, attach the decoded user information to the request object
        req.user = decoded;
        next(); // Call next middleware or route handler
    });
}


///Login User
export async function loginUser(req, res, con) {
    const { email, password } = req.body;

    try {
        const user = await new Promise((resolve, reject) => {
            con.query('SELECT * FROM users WHERE email = ?', email, (error, results) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(results[0]);
            });
        });

        if (!user) {
            res.status(401).send('Invalid email or password');
            return;
        }

        const passwordMatch = await bcrypt.compare(password, user.password);

        if (!passwordMatch) {
            res.status(401).send('Invalid email or password');
            return;
        }

        const token = jwt.sign({ userId: user.userId, email: user.email }, jwt_secret_key, { expiresIn: '1h' });

        res.status(200).json({ token, message: 'Login successful' });
    } catch (error) {
        console.error('Error logging in user: ' + error.message);
        res.status(500).send('Error logging in user');
    }
}


///Register User
export async function registerUser(req, res, con) {
    const user = req.body
    console.log(req.body)
    con.query('SELECT * FROM users WHERE username = ?', user.username, async (error, results, fields) => {
        if (error) {
            console.error('Error checking username: ' + error.message);
            res.status(500).send('Error checking username');
            return;
        }

        if (results.length > 0) {
            // Username already exists
            res.status(400).send('Username already exists');
            return;
        }

        try {
            const hashedPassword = await bcrypt.hash(user.password, 10); // 10 is the saltRounds parameter
            user.password = hashedPassword;
            con.query('INSERT INTO users SET ?', [user], (error, results, field) => {
                if (error) {
                    console.error('Error inserting data: ' + error.message);
                    res.status(500).send('Error inserting data');
                    return;
                }
                console.log('Data inserted successfully');
                const token = jwt.sign({ userId: results.inserted, username: user.email }, jwt_secret_key, { expiresIn: '5m' })
                res.status(200).json({ token, message: 'User registered successfully' });
            })
        } catch (_) {
            console.error('Error hashing password: ' + _);
            res.status(500).send('Error hashing password');
        }
    })
}

///Insert Task
export function insertTasks(req, res, con, io) {
    const task = req.body
    console.log(req.body)
    con.query('INSERT INTO tasks SET ?', [task], (error, results, field) => {
        if (error) {
            console.error('Error inserting data: ' + error.message);
            res.status(500).send('Error inserting data');
            return;
        }
        console.log('Data inserted successfully');
        res.status(200).send('Data inserted successfully');
    })

    con.query('SELECT COUNT(*) AS totalCount FROM tasks', (error, results) => {
        if (error) {
            console.error('Error fetching todo count:', error);
            return;
        }
        const totalCount = results[0].totalCount;
        io.emit('totalCount', totalCount)
    })
}

///Get user
export function getUser(req, res, con, username) {
    con.query('SELECT user_id, username, email, profile_picture, created_date, updated_date FROM users WHERE username = ?', [username], (error, results) => {
        if (error) {
            console.error('Error retrieving user: ' + error.message);
            res.status(500).send('Error retrieving user');
            return;
        }

        // Check if user exists
        if (results.length === 0) {
            return res.status(404).send('User not found');
        }

        // User found, return the user object
        const user = results[0];
        res.status(200).json(user);
    });
}

///Get Categories
export function getCategories(req, res, con) {
    getAllLists(req, res, con, 'categories', 'category_name')
}

export function getTodos(req, res, con) {
    getAllLists(req, res, con, 'tasks', 'task_name')
}
export function getTodosByUser(req, res, con, username) {
    getAllLists(req, res, con, 'tasks', 'task_name', username)
}

function getAllLists(req, res, con, tableName, fieldName, user_id = null) {
    try {
        let { page, pageSize, query } = req.query;

        // Convert page and pageSize to numbers
        page = parseInt(page, 10);
        pageSize = parseInt(pageSize, 10);

        // Set default values for page and pageSize
        if (isNaN(page) || page < 1) {
            page = 1;
        }
        if (isNaN(pageSize) || pageSize < 1) {
            pageSize = 10;
        }

        const offset = (page - 1) * pageSize;

        let sql = `SELECT * FROM ${tableName}`;
        let params = [];

        // Add username condition to the WHERE clause if username is provided
        if (user_id) {
            sql += ' WHERE user_id = ?';
            params.push(user_id);
        }

        // Add filtering based on query parameter if provided
        if (query) {
            sql += (user_id ? ' AND' : ' WHERE') + ` ${fieldName} LIKE ?`;
            params.push(`%${query}%`);
        }

        // Add pagination
        sql += ' LIMIT ? OFFSET ?';
        params.push(pageSize, offset);

        con.query(sql, params, (error, results) => {
            if (error) {
                console.error(`Error fetching ${tableName} ` + error.message);
                res.status(500).send(`Error fetching ${tableName}`);
                return;
            }

            // Construct pageInfo object
            const pageInfo = {
                page: page,
                pageSize: pageSize
            };

            // If query parameter is not provided, include it in the response
            if (!query) {
                pageInfo.query = '';
            }

            // Send response with pageInfo object and results
            res.status(200).json({ pageInfo, items: results });
        });
    } catch (error) {
        console.error(`Error fetching ${tableName} ` + error.message);
        res.status(500).send(`Error fetching ${tableName}`);
    }
}

export function updateUserProfilePicture(req, res, con) {
    // Access the uploaded file information
    // Retrieve username from request body
    const { username } = req.body;

    // Check if username is provided
    if (!username) {
        return res.status(400).send('Username field required');
    }

    // Check if file is uploaded
    if (!req.file) {
        return res.status(400).send('No file uploaded');
    }

    // Update user's profile picture in the database
    const profilePictureUrl = req.file.location;

    console.log(req.file.location)

    con.query('UPDATE users SET profile_picture = ?, updated_date = CURRENT_TIMESTAMP WHERE username = ?', [profilePictureUrl, username], (error, results) => {
        if (error) {
            console.error('Error updating user profile: ' + error.message);
            res.status(500).send('Error updating user profile');
            return;
        }
        console.log('User profile updated successfully');
        getUser(req, res, con, username)
    });
}

export function updateIsFavorite(req, res, con) {
    const { task_id, isFavorite } = req.body;

    if (!task_id || !isFavorite) {
        return res.status(400).json({ error: 'Task ID and isFavorite flag are required' });
    }

    const isFavoriteBool = (isFavorite === 'true');

    con.query('UPDATE tasks SET isFavorite = ? WHERE task_id = ?', [isFavoriteBool, task_id], (error, results) => {
        if (error) {
            console.error('Error updating task:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Task not found' });
        }

        res.status(200).json({ message: 'Task updated successfully' });
    });
}

export function deleteTODO(req, res, con, task_id) {

    // Extract the todo ID from the request parameters
    const todoId = task_id;

    // Check if todoId is provided
    if (!todoId) {
        return res.status(400).json({ error: 'Task ID is required' });
    }

    // Query the database to delete the todo by ID
    con.query('DELETE FROM tasks WHERE task_id = ?', [todoId], (error, results) => {
        if (error) {
            console.error('Error deleting todo:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // Check if any rows were affected (if no rows were found with the specified ID)
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Todo not found' });
        }

        // Todo deleted successfully
        res.status(200).json({ message: 'Todo deleted successfully' });
    });
}


export function updateTodo(req, res, con, task_id) {
    // Extract the taskId from the request parameters
    const taskId = task_id

    // Extract the fields to be updated from the request body
    const { task_name, description, due_date, category_id } = req.body;

    // Check if taskId and at least one field to update are provided
    if (!taskId || !(task_name || description || due_date || category_id)) {
        return res.status(400).json({ error: 'Task ID and at least one field to update are required' });
    }

    // Construct the SQL query to update the specified fields for the task
    let sql = 'UPDATE tasks SET ';
    const params = [];
    const fieldsToUpdate = [];

    if (task_name) {
        fieldsToUpdate.push('task_name = ?');
        params.push(task_name);
    }
    if (description) {
        fieldsToUpdate.push('description = ?');
        params.push(description);
    }
    if (due_date) {
        fieldsToUpdate.push('due_date = ?');
        params.push(due_date);
    }
    if (category_id) {
        fieldsToUpdate.push('category_id = ?');
        params.push(category_id);
    }

    sql += fieldsToUpdate.join(', ') + ' WHERE task_id = ?';
    params.push(taskId);

    // Execute the SQL query to update the task fields
    con.query(sql, params, (error, results) => {
        if (error) {
            console.error('Error updating task:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // Check if any rows were affected (if no task was found with the specified ID)
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Task updated successfully
        res.status(200).json({ message: 'Task updated successfully' });
    });
}


export function updateViews(req, res, con, task_id, actio) {
    // Extract the taskId and action from the request parameters
    const taskId = task_id
    const action = actio;

    // Validate the action parameter
    if (action !== 'increment' && action !== 'decrement') {
        return res.status(400).json({ error: 'Invalid action' });
    }

    // Construct the SQL query to update the views count for the task
    let sql;
    if (action === 'increment') {
        sql = 'UPDATE tasks SET views = views + 1 WHERE task_id = ?';
    } else {
        sql = 'UPDATE tasks SET views = views - 1 WHERE task_id = ?';
    }

    // Execute the SQL query to update views for the task
    con.query(sql, [taskId], (error, results) => {
        if (error) {
            console.error('Error updating views:', error);
            return res.status(500).json({ error: 'Internal server error' });
        }

        // Check if any rows were affected (if no task was found with the specified ID)
        if (results.affectedRows === 0) {
            return res.status(404).json({ message: 'Task not found' });
        }

        // Views updated successfully
        res.status(200).json({ message: 'Views updated successfully' });
    });
}