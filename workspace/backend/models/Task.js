const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    required: true,
    enum: ['backend', 'frontend', 'security', 'sdr', 'custom']
  },
  domain: {
    type: String,
    required: true,
    trim: true
  },
  priority: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'critical']
  },
  status: {
    type: String,
    required: true,
    enum: ['backlog', 'in-progress', 'review', 'done']
  },
  assignee: {
    type: String,
    required: true,
    trim: true
  },
  branch: {
    type: String,
    default: null,
    trim: true
  },
  cycles: {
    type: Number,
    default: 0,
    min: 0
  },
  _reviewed: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
taskSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

const Task = mongoose.model('Task', taskSchema);

module.exports = Task;
