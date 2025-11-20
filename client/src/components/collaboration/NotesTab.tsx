import React, { useState, useEffect } from 'react';
import { PlusIcon, XMarkIcon, PencilIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';

interface Note {
  _id: string;
  title: string;
  content: string;
  createdBy: {
    _id: string;
    name: string;
  };
  lastEditedBy?: {
    _id: string;
    name: string;
  };
  isPinned: boolean;
  updatedAt: string;
}

interface NotesTabProps {
  roomId: string;
}

const NotesTab: React.FC<NotesTabProps> = ({ roomId }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [noteForm, setNoteForm] = useState({ title: '', content: '' });

  useEffect(() => {
    fetchNotes();
    
    if (socket) {
      socket.on('note:created', handleNoteCreated);
      socket.on('note:updated', handleNoteUpdated);
      socket.on('note:deleted', handleNoteDeleted);
      
      return () => {
        socket.off('note:created');
        socket.off('note:updated');
        socket.off('note:deleted');
      };
    }
  }, [roomId, socket]);

  const fetchNotes = async () => {
    try {
      const response = await axios.get(`/collaboration/rooms/${roomId}/notes`);
      if (response.data.success) {
        setNotes(response.data.notes);
      }
    } catch (error) {
      console.error('[NotesTab] Failed to fetch notes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleNoteCreated = (data: { note: Note }) => {
    setNotes(prev => [data.note, ...prev]);
  };

  const handleNoteUpdated = (data: { note: Note }) => {
    setNotes(prev => prev.map(n => n._id === data.note._id ? data.note : n));
  };

  const handleNoteDeleted = (data: { noteId: string }) => {
    setNotes(prev => prev.filter(n => n._id !== data.noteId));
  };

  const handleCreateNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteForm.title.trim()) return;

    try {
      const response = await axios.post(`/collaboration/rooms/${roomId}/notes`, {
        title: noteForm.title,
        content: noteForm.content
      });

      if (response.data.success) {
        setNoteForm({ title: '', content: '' });
        setShowForm(false);
      }
    } catch (error: any) {
      console.error('[NotesTab] Failed to create note:', error);
      alert(error.response?.data?.message || 'Failed to create note');
    }
  };

  const handleUpdateNote = async (noteId: string, updates: { title?: string; content?: string }) => {
    try {
      await axios.put(`/collaboration/notes/${noteId}`, updates);
      setEditingNote(null);
    } catch (error: any) {
      console.error('[NotesTab] Failed to update note:', error);
      alert(error.response?.data?.message || 'Failed to update note');
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;

    try {
      await axios.delete(`/collaboration/notes/${noteId}`);
    } catch (error: any) {
      console.error('[NotesTab] Failed to delete note:', error);
      alert(error.response?.data?.message || 'Failed to delete note');
    }
  };

  const startEditing = (note: Note) => {
    setEditingNote(note);
    setNoteForm({ title: note.title, content: note.content });
    setShowForm(true);
  };

  if (loading) {
    return <div className="p-4 text-center text-secondary-600 dark:text-[var(--text-secondary)]">Loading notes...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium text-secondary-900 dark:text-[var(--text-primary)]">Notes ({notes.length})</h4>
        <button
          onClick={() => {
            setEditingNote(null);
            setNoteForm({ title: '', content: '' });
            setShowForm(!showForm);
          }}
          className="btn-secondary p-2"
          title="Add Note"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editingNote) {
              handleUpdateNote(editingNote._id, noteForm);
            } else {
              handleCreateNote(e);
            }
          }}
          className="mb-4 p-3 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg"
        >
          <input
            type="text"
            placeholder="Note title"
            value={noteForm.title}
            onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })}
            className="w-full mb-2 input-field"
            required
          />
          <textarea
            placeholder="Note content (supports markdown)"
            value={noteForm.content}
            onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })}
            className="w-full mb-2 input-field"
            rows={6}
          />
          <div className="flex gap-2">
            <button type="submit" className="btn-primary flex-1 text-sm">
              {editingNote ? 'Update' : 'Create'}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingNote(null);
              }}
              className="btn-secondary p-2"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {notes.map(note => (
          <div key={note._id} className="p-3 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg">
            <div className="flex justify-between items-start mb-2">
              <h5 className="font-medium text-secondary-900 dark:text-[var(--text-primary)] text-sm">{note.title}</h5>
              <div className="flex gap-1">
                <button
                  onClick={() => startEditing(note)}
                  className="text-secondary-400 hover:text-primary-600"
                  title="Edit note"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDeleteNote(note._id)}
                  className="text-secondary-400 hover:text-red-600"
                  title="Delete note"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
            {note.content && (
              <div className="text-xs text-secondary-600 dark:text-[var(--text-secondary)] whitespace-pre-wrap mb-2">
                {note.content.substring(0, 200)}{note.content.length > 200 ? '...' : ''}
              </div>
            )}
            <div className="text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
              {note.lastEditedBy ? `Edited by ${note.lastEditedBy.name}` : `Created by ${note.createdBy.name}`}
              {' • '}
              {new Date(note.updatedAt).toLocaleDateString()}
            </div>
          </div>
        ))}
        {notes.length === 0 && (
          <p className="text-center text-secondary-500 dark:text-[var(--text-secondary)] text-sm py-8">No notes yet</p>
        )}
      </div>
    </div>
  );
};

export default NotesTab;

