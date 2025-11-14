const express = require('express');
const { body, validationResult } = require('express-validator');
const Task = require('../models/Task');
const Todo = require('../models/Todo');
const Note = require('../models/Note');
const File = require('../models/File');
const Room = require('../models/Room');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { authenticateToken } = require('../middleware/auth');
const { ensureRoomConversation } = require('../utils/roomConversation');

const router = express.Router();

// Helper: Check if user is a room participant
async function isRoomParticipant(roomId, userId) {
  const room = await Room.findById(roomId).lean();
  if (!room) return false;
  
  const participantIds = room.participants.map(p => 
    (p.user?._id || p.user || p).toString()
  );
  return participantIds.includes(userId.toString());
}

// Helper: Post system message to conversation
async function postSystemMessage(conversationId, content, senderId, io) {
  try {
    const message = await Message.create({
      conversation: conversationId,
      sender: senderId,
      content,
      attachments: []
    });
    
    if (io) {
      const populatedMessage = await Message.findById(message._id).populate('sender', 'name profilePicture');
      const payload = {
        conversationId: conversationId.toString(),
        message: populatedMessage
      };
      io.to(`conversation:${conversationId}`).emit('message:new', payload);
    }
  } catch (error) {
    console.error('[Collaboration] Failed to post system message:', error);
  }
}

// ==================== TASKS ====================

// @route   POST /api/collaboration/rooms/:roomId/tasks
// @desc    Create a new task
// @access  Private
router.post('/rooms/:roomId/tasks', authenticateToken, [
  body('title').trim().notEmpty().withMessage('Task title is required'),
  body('priority').optional().isIn(['Low', 'Medium', 'High', 'Urgent']),
  body('dueDate').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { roomId } = req.params;
    const userId = req.user._id;

    if (!(await isRoomParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const conversation = await ensureRoomConversation(roomId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const task = await Task.create({
      roomId,
      conversationId: conversation._id,
      title: req.body.title,
      description: req.body.description || '',
      assignedTo: req.body.assignedTo || null,
      createdBy: userId,
      priority: req.body.priority || 'Medium',
      dueDate: req.body.dueDate || null,
      tags: req.body.tags || []
    });

    await task.populate('createdBy', 'name profilePicture');
    await task.populate('assignedTo', 'name profilePicture');

    // Post system message
    const io = req.app.get('io');
    const assigneeText = task.assignedTo ? ` assigned to ${task.assignedTo.name}` : '';
    await postSystemMessage(
      conversation._id,
      `📋 Task created: "${task.title}"${assigneeText}`,
      userId,
      io
    );

    if (io) {
      io.to(`room:${roomId}`).emit('task:created', { task });
    }

    res.json({ success: true, task });
  } catch (error) {
    console.error('[Collaboration] Create task error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/collaboration/rooms/:roomId/tasks
// @desc    Get all tasks for a room
// @access  Private
router.get('/rooms/:roomId/tasks', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    if (!(await isRoomParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const tasks = await Task.find({ roomId })
      .populate('createdBy', 'name profilePicture')
      .populate('assignedTo', 'name profilePicture')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, tasks });
  } catch (error) {
    console.error('[Collaboration] Get tasks error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/collaboration/tasks/:taskId
// @desc    Update a task
// @access  Private
router.put('/tasks/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (!(await isRoomParticipant(task.roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const updateData = {};
    if (req.body.title !== undefined) updateData.title = req.body.title;
    if (req.body.description !== undefined) updateData.description = req.body.description;
    if (req.body.assignedTo !== undefined) updateData.assignedTo = req.body.assignedTo;
    if (req.body.status !== undefined) {
      updateData.status = req.body.status;
      if (req.body.status === 'Completed') {
        updateData.completedAt = new Date();
      }
    }
    if (req.body.priority !== undefined) updateData.priority = req.body.priority;
    if (req.body.dueDate !== undefined) updateData.dueDate = req.body.dueDate;
    if (req.body.tags !== undefined) updateData.tags = req.body.tags;

    Object.assign(task, updateData);
    await task.save();

    await task.populate('createdBy', 'name profilePicture');
    await task.populate('assignedTo', 'name profilePicture');

    const io = req.app.get('io');
    if (io) {
      io.to(`room:${task.roomId}`).emit('task:updated', { task });
    }

    res.json({ success: true, task });
  } catch (error) {
    console.error('[Collaboration] Update task error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/collaboration/tasks/:taskId
// @desc    Delete a task
// @access  Private
router.delete('/tasks/:taskId', authenticateToken, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user._id;

    const task = await Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    if (!(await isRoomParticipant(task.roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const roomId = task.roomId;
    await Task.findByIdAndDelete(taskId);

    const io = req.app.get('io');
    if (io) {
      io.to(`room:${roomId}`).emit('task:deleted', { taskId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Collaboration] Delete task error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== TODOS ====================

// @route   POST /api/collaboration/rooms/:roomId/todos
// @desc    Create a new todo
// @access  Private
router.post('/rooms/:roomId/todos', authenticateToken, [
  body('title').trim().notEmpty().withMessage('Todo title is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { roomId } = req.params;
    const userId = req.user._id;

    if (!(await isRoomParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const conversation = await ensureRoomConversation(roomId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const todoCount = await Todo.countDocuments({ roomId });
    const todo = await Todo.create({
      roomId,
      conversationId: conversation._id,
      title: req.body.title,
      description: req.body.description || '',
      createdBy: userId,
      order: todoCount
    });

    await todo.populate('createdBy', 'name profilePicture');

    // Post system message
    const io = req.app.get('io');
    await postSystemMessage(
      conversation._id,
      `✅ Todo added: "${todo.title}"`,
      userId,
      io
    );
    if (io) {
      io.to(`room:${roomId}`).emit('todo:created', { todo });
    }

    res.json({ success: true, todo });
  } catch (error) {
    console.error('[Collaboration] Create todo error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/collaboration/rooms/:roomId/todos
// @desc    Get all todos for a room
// @access  Private
router.get('/rooms/:roomId/todos', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    if (!(await isRoomParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const todos = await Todo.find({ roomId })
      .populate('createdBy', 'name profilePicture')
      .populate('completedBy', 'name profilePicture')
      .sort({ order: 1, createdAt: -1 })
      .lean();

    res.json({ success: true, todos });
  } catch (error) {
    console.error('[Collaboration] Get todos error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/collaboration/todos/:todoId
// @desc    Update a todo (toggle completion, reorder, etc.)
// @access  Private
router.put('/todos/:todoId', authenticateToken, async (req, res) => {
  try {
    const { todoId } = req.params;
    const userId = req.user._id;

    const todo = await Todo.findById(todoId);
    if (!todo) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    if (!(await isRoomParticipant(todo.roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    if (req.body.completed !== undefined) {
      todo.completed = req.body.completed;
      if (req.body.completed) {
        todo.completedAt = new Date();
        todo.completedBy = userId;
      } else {
        todo.completedAt = null;
        todo.completedBy = null;
      }
    }
    if (req.body.title !== undefined) todo.title = req.body.title;
    if (req.body.description !== undefined) todo.description = req.body.description;
    if (req.body.order !== undefined) todo.order = req.body.order;

    await todo.save();
    await todo.populate('createdBy', 'name profilePicture');
    await todo.populate('completedBy', 'name profilePicture');

    const io = req.app.get('io');
    if (io) {
      io.to(`room:${todo.roomId}`).emit('todo:updated', { todo });
    }

    res.json({ success: true, todo });
  } catch (error) {
    console.error('[Collaboration] Update todo error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/collaboration/todos/:todoId
// @desc    Delete a todo
// @access  Private
router.delete('/todos/:todoId', authenticateToken, async (req, res) => {
  try {
    const { todoId } = req.params;
    const userId = req.user._id;

    const todo = await Todo.findById(todoId);
    if (!todo) {
      return res.status(404).json({ success: false, message: 'Todo not found' });
    }

    if (!(await isRoomParticipant(todo.roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const roomId = todo.roomId;
    await Todo.findByIdAndDelete(todoId);

    const io = req.app.get('io');
    if (io) {
      io.to(`room:${roomId}`).emit('todo:deleted', { todoId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Collaboration] Delete todo error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== NOTES ====================

// @route   POST /api/collaboration/rooms/:roomId/notes
// @desc    Create a new note
// @access  Private
router.post('/rooms/:roomId/notes', authenticateToken, [
  body('title').trim().notEmpty().withMessage('Note title is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { roomId } = req.params;
    const userId = req.user._id;

    if (!(await isRoomParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const conversation = await ensureRoomConversation(roomId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const note = await Note.create({
      roomId,
      conversationId: conversation._id,
      title: req.body.title,
      content: req.body.content || '',
      createdBy: userId,
      tags: req.body.tags || []
    });

    await note.populate('createdBy', 'name profilePicture');

    // Post system message
    const io = req.app.get('io');
    await postSystemMessage(
      conversation._id,
      `📝 Note created: "${note.title}"`,
      userId,
      io
    );
    if (io) {
      io.to(`room:${roomId}`).emit('note:created', { note });
    }

    res.json({ success: true, note });
  } catch (error) {
    console.error('[Collaboration] Create note error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/collaboration/rooms/:roomId/notes
// @desc    Get all notes for a room
// @access  Private
router.get('/rooms/:roomId/notes', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    if (!(await isRoomParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const notes = await Note.find({ roomId })
      .populate('createdBy', 'name profilePicture')
      .populate('lastEditedBy', 'name profilePicture')
      .sort({ isPinned: -1, updatedAt: -1 })
      .lean();

    res.json({ success: true, notes });
  } catch (error) {
    console.error('[Collaboration] Get notes error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   PUT /api/collaboration/notes/:noteId
// @desc    Update a note
// @access  Private
router.put('/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user._id;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    if (!(await isRoomParticipant(note.roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    if (req.body.title !== undefined) note.title = req.body.title;
    if (req.body.content !== undefined) {
      note.content = req.body.content;
      note.lastEditedBy = userId;
      note.lastEditedAt = new Date();
    }
    if (req.body.tags !== undefined) note.tags = req.body.tags;
    if (req.body.isPinned !== undefined) note.isPinned = req.body.isPinned;

    await note.save();
    await note.populate('createdBy', 'name profilePicture');
    await note.populate('lastEditedBy', 'name profilePicture');

    const io = req.app.get('io');
    if (io) {
      io.to(`room:${note.roomId}`).emit('note:updated', { note });
    }

    res.json({ success: true, note });
  } catch (error) {
    console.error('[Collaboration] Update note error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/collaboration/notes/:noteId
// @desc    Delete a note
// @access  Private
router.delete('/notes/:noteId', authenticateToken, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user._id;

    const note = await Note.findById(noteId);
    if (!note) {
      return res.status(404).json({ success: false, message: 'Note not found' });
    }

    if (!(await isRoomParticipant(note.roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const roomId = note.roomId;
    await Note.findByIdAndDelete(noteId);

    const io = req.app.get('io');
    if (io) {
      io.to(`room:${roomId}`).emit('note:deleted', { noteId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Collaboration] Delete note error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ==================== FILES ====================

// @route   POST /api/collaboration/rooms/:roomId/files
// @desc    Upload/create a file or folder
// @access  Private
router.post('/rooms/:roomId/files', authenticateToken, [
  body('name').trim().notEmpty().withMessage('File name is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { roomId } = req.params;
    const userId = req.user._id;

    if (!(await isRoomParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const conversation = await ensureRoomConversation(roomId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    const file = await File.create({
      roomId,
      conversationId: conversation._id,
      name: req.body.name,
      originalName: req.body.originalName || req.body.name,
      url: req.body.url || '',
      fileType: req.body.fileType || 'file',
      mimeType: req.body.mimeType || 'application/octet-stream',
      size: req.body.size || 0,
      uploadedBy: userId,
      folderId: req.body.folderId || null,
      isFolder: req.body.isFolder || false,
      thumbnailUrl: req.body.thumbnailUrl || null,
      description: req.body.description || '',
      tags: req.body.tags || []
    });

    await file.populate('uploadedBy', 'name profilePicture');

    // Post system message
    const io = req.app.get('io');
    const fileType = file.isFolder ? '📁 Folder' : '📎 File';
    await postSystemMessage(
      conversation._id,
      `${fileType} uploaded: "${file.name}"`,
      userId,
      io
    );
    if (io) {
      io.to(`room:${roomId}`).emit('file:uploaded', { file });
    }

    res.json({ success: true, file });
  } catch (error) {
    console.error('[Collaboration] Upload file error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/collaboration/rooms/:roomId/files
// @desc    Get all files for a room (optionally filtered by folder)
// @access  Private
router.get('/rooms/:roomId/files', authenticateToken, async (req, res) => {
  try {
    const { roomId } = req.params;
    const { folderId } = req.query;
    const userId = req.user._id;

    if (!(await isRoomParticipant(roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    const query = { roomId };
    if (folderId) {
      query.folderId = folderId;
    } else {
      query.folderId = null; // Root folder
    }

    const files = await File.find(query)
      .populate('uploadedBy', 'name profilePicture')
      .sort({ isFolder: -1, name: 1 })
      .lean();

    res.json({ success: true, files });
  } catch (error) {
    console.error('[Collaboration] Get files error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   DELETE /api/collaboration/files/:fileId
// @desc    Delete a file or folder
// @access  Private
router.delete('/files/:fileId', authenticateToken, async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.user._id;

    const file = await File.findById(fileId);
    if (!file) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    if (!(await isRoomParticipant(file.roomId, userId))) {
      return res.status(403).json({ success: false, message: 'Not a room participant' });
    }

    // If it's a folder, delete all files inside it
    if (file.isFolder) {
      await File.deleteMany({ folderId: fileId });
    }

    const roomId = file.roomId;
    await File.findByIdAndDelete(fileId);

    const io = req.app.get('io');
    if (io) {
      io.to(`room:${roomId}`).emit('file:deleted', { fileId });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Collaboration] Delete file error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

