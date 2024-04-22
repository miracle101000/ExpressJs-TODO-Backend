import express from 'express'
import mysql from 'mysql2'
import multer from 'multer';
import multerS3 from 'multer-s3';
import AWS from 'aws-sdk'
import dotenv from 'dotenv'
import { registerUser, insertTasks, loginUser, getCategories, verifyToken, updateUserProfilePicture, getUser, getTodos, updateIsFavorite, getTodosByUser, deleteTODO, updateTodo, updateViews } from './my_functions.js'
import { replaceFilenameWithUsername } from './helpers.js'

dotenv.config()
const app = express()
const PORT = 3000

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

var con = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Godisgood/1",
    database: "TODO_APP"
})

con.connect((err) => {
    if (err) throw err;
    console.log("Connected!")
})

// Configure AWS SDK with your AWS credentials
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.AWS_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: function (req, file, cb) {
            const { username } = req.body
            console.log("UserName::", username)
            deleteObject(file.originalname, username)
            cb(null, 'profile-pictures/' + replaceFilenameWithUsername(file.originalname, username));
        }
    })
})

function deleteObject(fileName, username) {
    s3.deleteObject({ Bucket: 'todo-profileimages-miracle', Key: 'profile-pictures/' + replaceFilenameWithUsername(fileName, username) }, function (err, data) {
        if (err) {
            console.log("Error deleting object:", err);
        } else {
            console.log("Object deleted successfully.");
        }
    });
}

app.post('/api/v1/login', (req, res) => loginUser(req, res, con))
app.post('/api/v1/register', (req, res) => registerUser(req, res, con))
app.get('/api/v1/getUser/:user_id', verifyToken, (req, res) => {
    const { user_id } = req.params;
    getUser(req, res, con, user_id)
})
app.get('/api/v1/todos', verifyToken, (req, res) => getTodos(req, res, con))
app.get('/api/v1/todosByUser/:username', verifyToken, (req, res) => {
    const { username } = req.params;
    getTodosByUser(req, res, con, username)
})
app.post('/api/v1/todos/add', verifyToken, (req, res) => insertTasks(req, res, con))
app.post('/api/v1/todos/updateIsFavorite', verifyToken, (req, res) => updateIsFavorite(req, res, con));
app.delete('/api/v1/todos/delete/:task_id', verifyToken, (req, res) => {
    const { task_id } = req.params;
    deleteTODO(req, res, con, task_id)
})
app.put('/api/v1/todos/update/:task_id', verifyToken, (req, res) => {
    const { task_id } = req.params;
    updateTodo(req, res, con, task_id)
})
app.put('/api/v1/todos/updateViews/:task_id/:action', verifyToken, (req, res) => {
    // Extract the taskId from the request parameters
    const { task_id, action } = req.params;
    updateViews(req, res, con, task_id, action)
});
app.get('/api/v1/categories', verifyToken, (req, res) => getCategories(req, res, con))

app.post('/api/v1/updateProfilePicture', verifyToken, upload.single('profile_picture'), (req, res) => updateUserProfilePicture(req, res, con))


app.listen(PORT, () => {
    console.log(`Server listening on ${PORT}`);
})




