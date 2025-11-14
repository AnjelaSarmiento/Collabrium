import React, { useState, useEffect } from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';

interface Task {
  _id: string;
  title: string;
  description?: string;
  assignedTo?: {
    _id: string;
    name: string;
  };
  status: 'Pending' | 'In Progress' | 'Completed' | 'Cancelled';
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  dueDate?: string;
  createdBy: {
    _id: string;
    name: string;
  };
}

interface TasksTabProps {
  roomId: string;
}

const TasksTab: React.FC<TasksTabProps> = ({ roomId }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    priority: 'Medium' as const,
    assignedTo: '',
    dueDate: ''
  });

  useEffect(() => {
    fetchTasks();
    
    if (socket) {
      socket.on('task:created', handleTaskCreated);
      socket.on('task:updated', handleTaskUpdated);
      socket.on('task:deleted', handleTaskDeleted);
      
      return () => {
        socket.off('task:created');
        socket.off('task:updated');
        socket.off('task:deleted');
      };
    }
  }, [roomId, socket]);

  const fetchTasks = async () => {
    try {
      const response = await axios.get(`/collaboration/rooms/${roomId}/tasks`);
      if (response.data.success) {
        setTasks(response.data.tasks);
      }
    } catch (error) {
      console.error('[TasksTab] Failed to fetch tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskCreated = (data: { task: Task }) => {
    setTasks(prev => [data.task, ...prev]);
  };

  const handleTaskUpdated = (data: { task: Task }) => {
    setTasks(prev => prev.map(t => t._id === data.task._id ? data.task : t));
  };

  const handleTaskDeleted = (data: { taskId: string }) => {
    setTasks(prev => prev.filter(t => t._id !== data.taskId));
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title.trim()) return;

    try {
      const response = await axios.post(`/collaboration/rooms/${roomId}/tasks`, {
        title: newTask.title,
        description: newTask.description,
        priority: newTask.priority,
        assignedTo: newTask.assignedTo || null,
        dueDate: newTask.dueDate || null
      });

      if (response.data.success) {
        setNewTask({ title: '', description: '', priority: 'Medium', assignedTo: '', dueDate: '' });
        setShowForm(false);
      }
    } catch (error: any) {
      console.error('[TasksTab] Failed to create task:', error);
      alert(error.response?.data?.message || 'Failed to create task');
    }
  };

  const handleUpdateTask = async (taskId: string, updates: Partial<Task>) => {
    try {
      await axios.put(`/collaboration/tasks/${taskId}`, updates);
    } catch (error: any) {
      console.error('[TasksTab] Failed to update task:', error);
      alert(error.response?.data?.message || 'Failed to update task');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!window.confirm('Are you sure you want to delete this task?')) return;

    try {
      await axios.delete(`/collaboration/tasks/${taskId}`);
    } catch (error: any) {
      console.error('[TasksTab] Failed to delete task:', error);
      alert(error.response?.data?.message || 'Failed to delete task');
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-secondary-600">Loading tasks...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium text-secondary-900">Tasks ({tasks.length})</h4>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-secondary p-2"
          title="Add Task"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateTask} className="mb-4 p-3 bg-secondary-50 rounded-lg">
          <input
            type="text"
            placeholder="Task title"
            value={newTask.title}
            onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
            className="w-full mb-2 input-field"
            required
          />
          <textarea
            placeholder="Description (optional)"
            value={newTask.description}
            onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            className="w-full mb-2 input-field"
            rows={2}
          />
          <select
            value={newTask.priority}
            onChange={(e) => setNewTask({ ...newTask, priority: e.target.value as any })}
            className="w-full mb-2 input-field"
          >
            <option value="Low">Low Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="High">High Priority</option>
            <option value="Urgent">Urgent</option>
          </select>
          <input
            type="date"
            value={newTask.dueDate}
            onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
            className="w-full mb-2 input-field"
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1 text-sm">
              Create
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="btn-secondary p-2"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {tasks.map(task => (
          <div key={task._id} className="p-3 bg-secondary-50 rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <h5 className="font-medium text-secondary-900 text-sm">{task.title}</h5>
              <button
                onClick={() => handleDeleteTask(task._id)}
                className="text-secondary-400 hover:text-red-600"
                title="Delete task"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>
            {task.description && (
              <p className="text-xs text-secondary-600 mb-2">{task.description}</p>
            )}
            <div className="flex items-center gap-2 mb-2">
              <select
                value={task.status}
                onChange={(e) => handleUpdateTask(task._id, { status: e.target.value as any })}
                className="text-xs input-field flex-1"
              >
                <option value="Pending">Pending</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
              </select>
              <span className={`px-2 py-1 text-xs rounded-full ${
                task.priority === 'Urgent' ? 'bg-red-100 text-red-800' :
                task.priority === 'High' ? 'bg-orange-100 text-orange-800' :
                task.priority === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                'bg-green-100 text-green-800'
              }`}>
                {task.priority}
              </span>
            </div>
            {task.assignedTo && (
              <p className="text-xs text-secondary-500">Assigned to: {task.assignedTo.name}</p>
            )}
            {task.dueDate && (
              <p className="text-xs text-secondary-500">
                Due: {new Date(task.dueDate).toLocaleDateString()}
              </p>
            )}
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-center text-secondary-500 text-sm py-8">No tasks yet</p>
        )}
      </div>
    </div>
  );
};

export default TasksTab;

