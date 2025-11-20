import React, { useState, useEffect, useRef } from 'react';
import { PaperClipIcon, FolderIcon, XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import axios from 'axios';
import { useSocket } from '../../contexts/SocketContext';
import { getProfileImageUrl } from '../../utils/image';

interface File {
  _id: string;
  name: string;
  originalName: string;
  url: string;
  fileType: string;
  mimeType: string;
  size: number;
  uploadedBy: {
    _id: string;
    name: string;
    profilePicture: string;
  };
  folderId?: string;
  isFolder: boolean;
  uploadedAt: string;
}

interface FilesTabProps {
  roomId: string;
}

const FilesTab: React.FC<FilesTabProps> = ({ roomId }) => {
  const { socket } = useSocket();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles();
    
    if (socket) {
      socket.on('file:uploaded', handleFileUploaded);
      socket.on('file:deleted', handleFileDeleted);
      
      return () => {
        socket.off('file:uploaded');
        socket.off('file:deleted');
      };
    }
  }, [roomId, currentFolderId, socket]);

  const fetchFiles = async () => {
    try {
      const params = currentFolderId ? { folderId: currentFolderId } : {};
      const response = await axios.get(`/collaboration/rooms/${roomId}/files`, { params });
      if (response.data.success) {
        setFiles(response.data.files);
      }
    } catch (error) {
      console.error('[FilesTab] Failed to fetch files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUploaded = (data: { file: File }) => {
    if (data.file.folderId === currentFolderId) {
      setFiles(prev => [data.file, ...prev]);
    }
  };

  const handleFileDeleted = (data: { fileId: string }) => {
    setFiles(prev => prev.filter(f => f._id !== data.fileId));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // TODO: Upload to Cloudinary or your file storage service
    // For now, we'll create a placeholder file entry
    try {
      const response = await axios.post(`/collaboration/rooms/${roomId}/files`, {
        name: file.name,
        originalName: file.name,
        url: URL.createObjectURL(file), // Temporary URL - replace with actual upload
        fileType: file.type.startsWith('image/') ? 'image' : 'file',
        mimeType: file.type,
        size: file.size,
        folderId: currentFolderId || null
      });

      if (response.data.success) {
        console.log('[FilesTab] File uploaded successfully');
      }
    } catch (error: any) {
      console.error('[FilesTab] Failed to upload file:', error);
      alert(error.response?.data?.message || 'Failed to upload file');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFile = async (fileId: string) => {
    if (!window.confirm('Are you sure you want to delete this file?')) return;

    try {
      await axios.delete(`/collaboration/files/${fileId}`);
    } catch (error: any) {
      console.error('[FilesTab] Failed to delete file:', error);
      alert(error.response?.data?.message || 'Failed to delete file');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  if (loading) {
    return <div className="p-4 text-center text-secondary-600 dark:text-[var(--text-secondary)]">Loading files...</div>;
  }

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h4 className="font-medium text-secondary-900 dark:text-[var(--text-primary)]">Files ({files.length})</h4>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="btn-secondary p-2"
          title="Upload File"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div className="space-y-2">
        {files.map(file => (
          <div key={file._id} className="p-3 bg-secondary-50 dark:bg-[var(--bg-hover)] rounded-lg flex items-center gap-3">
            {file.isFolder ? (
              <FolderIcon className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            ) : (
              <PaperClipIcon className="h-5 w-5 text-secondary-500 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-secondary-900 dark:text-[var(--text-primary)] truncate">{file.name}</p>
              <div className="flex items-center gap-2 text-xs text-secondary-500 dark:text-[var(--text-secondary)]">
                <img
                  src={getProfileImageUrl(file.uploadedBy.profilePicture) || '/default-avatar.png'}
                  alt={file.uploadedBy.name}
                  className="h-4 w-4 rounded-full"
                />
                <span>{file.uploadedBy.name}</span>
                {!file.isFolder && <span>• {formatFileSize(file.size)}</span>}
              </div>
            </div>
            {file.url && !file.isFolder && (
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 text-sm"
              >
                View
              </a>
            )}
            <button
              onClick={() => handleDeleteFile(file._id)}
              className="text-secondary-400 hover:text-red-600 flex-shrink-0"
              title="Delete file"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
        {files.length === 0 && (
          <p className="text-center text-secondary-500 dark:text-[var(--text-secondary)] text-sm py-8">No files yet</p>
        )}
      </div>
    </div>
  );
};

export default FilesTab;

