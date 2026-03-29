const request = require('supertest');
const mongoose = require('mongoose');
const Task = require('../models/Task');
const app = require('../server');

describe('Task API', () => {
  beforeAll(async () => {
    await mongoose.connect(process.env.MONGODB_URI_TEST || 'mongodb://localhost:27017/backlog_test');
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Task.deleteMany({});
  });

  describe('GET /api/tasks', () => {
    it('should return empty array when no tasks', async () => {
      const res = await request(app).get('/api/tasks');
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('should return all tasks', async () => {
      const task = new Task({
        id: 'TASK-001',
        title: 'Test Task',
        description: 'Test Description',
        type: 'backend',
        domain: 'general',
        priority: 'high',
        status: 'backlog',
        assignee: 'backend'
      });
      await task.save();

      const res = await request(app).get('/api/tasks');
      expect(res.statusCode).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].title).toBe('Test Task');
    });
  });

  describe('POST /api/tasks', () => {
    it('should create a new task', async () => {
      const newTask = {
        title: 'New Task',
        description: 'New Description',
        type: 'frontend',
        domain: 'ui',
        priority: 'medium',
        status: 'backlog',
        assignee: 'frontend'
      };

      const res = await request(app)
        .post('/api/tasks')
        .send(newTask);

      expect(res.statusCode).toBe(201);
      expect(res.body.title).toBe('New Task');
      expect(res.body.id).toMatch(/^TASK-\d{3}$/);
    });

    it('should use provided ID if given', async () => {
      const newTask = {
        id: 'CUSTOM-001',
        title: 'Custom Task',
        description: 'Custom Description',
        type: 'backend',
        domain: 'general',
        priority: 'high',
        status: 'backlog',
        assignee: 'backend'
      };

      const res = await request(app)
        .post('/api/tasks')
        .send(newTask);

      expect(res.statusCode).toBe(201);
      expect(res.body.id).toBe('CUSTOM-001');
    });
  });

  describe('GET /api/tasks/:id', () => {
    it('should return task by ID', async () => {
      const task = new Task({
        id: 'TASK-999',
        title: 'Find Me',
        description: 'Should be found',
        type: 'backend',
        domain: 'general',
        priority: 'high',
        status: 'backlog',
        assignee: 'backend'
      });
      await task.save();

      const res = await request(app).get('/api/tasks/TASK-999');
      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('Find Me');
    });

    it('should return 404 for non-existent task', async () => {
      const res = await request(app).get('/api/tasks/NONEXISTENT');
      expect(res.statusCode).toBe(404);
    });
  });

  describe('PUT /api/tasks/:id', () => {
    it('should update task', async () => {
      const task = new Task({
        id: 'TASK-888',
        title: 'Old Title',
        description: 'Old Description',
        type: 'backend',
        domain: 'general',
        priority: 'low',
        status: 'backlog',
        assignee: 'backend'
      });
      await task.save();

      const res = await request(app)
        .put('/api/tasks/TASK-888')
        .send({ title: 'Updated Title', status: 'in-progress' });

      expect(res.statusCode).toBe(200);
      expect(res.body.title).toBe('Updated Title');
      expect(res.body.status).toBe('in-progress');
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    it('should delete task', async () => {
      const task = new Task({
        id: 'TASK-777',
        title: 'Delete Me',
        description: 'Should be deleted',
        type: 'backend',
        domain: 'general',
        priority: 'high',
        status: 'backlog',
        assignee: 'backend'
      });
      await task.save();

      const res = await request(app).delete('/api/tasks/TASK-777');
      expect(res.statusCode).toBe(200);
      expect(res.body.message).toBe('Task deleted successfully');

      const check = await Task.findOne({ id: 'TASK-777' });
      expect(check).toBeNull();
    });
  });
});
