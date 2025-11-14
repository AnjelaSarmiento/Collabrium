import React, { useState, useEffect } from 'react';
import { PlusIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useSocket } from '../../contexts/SocketContext';

interface Todo {
  _id: string;
  title: string;
  description?: string;
  completed: boolean;
  completedAt?: string;
  completedBy?: {
    _id: string;
    name: string;
  };
  createdBy: {
    _id: string;
    name: string;
  };
  order: number;
}

interface TodosTabProps {
  roomId: string;
}

const TodosTab: React.FC<TodosTabProps> = ({ roomId }) => {
  const { socket } = useSocket();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTodo, setNewTodo] = useState({ title: '', description: '' });

  useEffect(() => {
    fetchTodos();
    
    if (socket) {
      socket.on('todo:created', handleTodoCreated);
      socket.on('todo:updated', handleTodoUpdated);
      socket.on('todo:deleted', handleTodoDeleted);
      
      return () => {
        socket.off('todo:created');
        socket.off('todo:updated');
        socket.off('todo:deleted');
      };
    }
  }, [roomId, socket]);

  const fetchTodos = async () => {
    try {
      const response = await axios.get(`/collaboration/rooms/${roomId}/todos`);
      if (response.data.success) {
        setTodos(response.data.todos);
      }
    } catch (error) {
      console.error('[TodosTab] Failed to fetch todos:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleTodoCreated = (data: { todo: Todo }) => {
    setTodos(prev => [...prev, data.todo].sort((a, b) => a.order - b.order));
  };

  const handleTodoUpdated = (data: { todo: Todo }) => {
    setTodos(prev => prev.map(t => t._id === data.todo._id ? data.todo : t));
  };

  const handleTodoDeleted = (data: { todoId: string }) => {
    setTodos(prev => prev.filter(t => t._id !== data.todoId));
  };

  const handleCreateTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.title.trim()) return;

    try {
      const response = await axios.post(`/collaboration/rooms/${roomId}/todos`, {
        title: newTodo.title,
        description: newTodo.description
      });

      if (response.data.success) {
        setNewTodo({ title: '', description: '' });
        setShowForm(false);
      }
    } catch (error: any) {
      console.error('[TodosTab] Failed to create todo:', error);
      alert(error.response?.data?.message || 'Failed to create todo');
    }
  };

  const handleToggleTodo = async (todoId: string, completed: boolean) => {
    try {
      await axios.put(`/collaboration/todos/${todoId}`, { completed: !completed });
    } catch (error: any) {
      console.error('[TodosTab] Failed to toggle todo:', error);
    }
  };

  const handleDeleteTodo = async (todoId: string) => {
    try {
      await axios.delete(`/collaboration/todos/${todoId}`);
    } catch (error: any) {
      console.error('[TodosTab] Failed to delete todo:', error);
      alert(error.response?.data?.message || 'Failed to delete todo');
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-secondary-600">Loading todos...</div>;
  }

  const completedTodos = todos.filter(t => t.completed);
  const pendingTodos = todos.filter(t => !t.completed);

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium text-secondary-900">
          To-dos ({pendingTodos.length} pending, {completedTodos.length} done)
        </h4>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-secondary p-2"
          title="Add Todo"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreateTodo} className="mb-4 p-3 bg-secondary-50 rounded-lg">
          <input
            type="text"
            placeholder="Todo title"
            value={newTodo.title}
            onChange={(e) => setNewTodo({ ...newTodo, title: e.target.value })}
            className="w-full mb-2 input-field"
            required
          />
          <textarea
            placeholder="Description (optional)"
            value={newTodo.description}
            onChange={(e) => setNewTodo({ ...newTodo, description: e.target.value })}
            className="w-full mb-2 input-field"
            rows={2}
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1 text-sm">
              Add
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
        {pendingTodos.map(todo => (
          <div key={todo._id} className="p-3 bg-secondary-50 rounded-lg flex items-start gap-2">
            <button
              onClick={() => handleToggleTodo(todo._id, todo.completed)}
              className="mt-0.5 flex-shrink-0"
              title="Mark as complete"
            >
              <div className="w-5 h-5 border-2 border-secondary-300 rounded hover:border-primary-600 transition-colors" />
            </button>
            <div className="flex-1">
              <h5 className="font-medium text-secondary-900 text-sm">{todo.title}</h5>
              {todo.description && (
                <p className="text-xs text-secondary-600 mt-1">{todo.description}</p>
              )}
            </div>
            <button
              onClick={() => handleDeleteTodo(todo._id)}
              className="text-secondary-400 hover:text-red-600 flex-shrink-0"
              title="Delete todo"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
        
        {completedTodos.length > 0 && (
          <>
            <div className="mt-4 pt-4 border-t border-secondary-200">
              <h5 className="text-xs font-medium text-secondary-500 mb-2">Completed</h5>
              {completedTodos.map(todo => (
                <div key={todo._id} className="p-3 bg-secondary-50 rounded-lg flex items-start gap-2 opacity-60">
                  <button
                    onClick={() => handleToggleTodo(todo._id, todo.completed)}
                    className="mt-0.5 flex-shrink-0"
                    title="Mark as incomplete"
                  >
                    <CheckIcon className="w-5 h-5 text-green-600" />
                  </button>
                  <div className="flex-1">
                    <h5 className="font-medium text-secondary-900 text-sm line-through">{todo.title}</h5>
                    {todo.description && (
                      <p className="text-xs text-secondary-600 mt-1 line-through">{todo.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteTodo(todo._id)}
                    className="text-secondary-400 hover:text-red-600 flex-shrink-0"
                    title="Delete todo"
                  >
                    <XMarkIcon className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
        
        {todos.length === 0 && (
          <p className="text-center text-secondary-500 text-sm py-8">No todos yet</p>
        )}
      </div>
    </div>
  );
};

export default TodosTab;

