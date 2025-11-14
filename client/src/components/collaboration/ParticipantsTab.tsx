import React from 'react';
import { getProfileImageUrl } from '../../utils/image';

interface Participant {
  user: {
    _id: string;
    name: string;
    profilePicture: string;
  };
  role: string;
}

interface ParticipantsTabProps {
  participants: Participant[];
}

const ParticipantsTab: React.FC<ParticipantsTabProps> = ({ participants }) => {
  return (
    <div className="p-4">
      <h4 className="font-medium text-secondary-900 mb-4">
        Participants ({participants.length})
      </h4>
      <div className="space-y-3">
        {participants.map(participant => (
          <div key={participant.user._id} className="flex items-center gap-3">
            <img
              src={getProfileImageUrl(participant.user.profilePicture) || '/default-avatar.png'}
              alt={participant.user.name}
              className="h-10 w-10 rounded-full object-cover"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-secondary-900">
                {participant.user.name}
              </p>
              <p className="text-xs text-secondary-500">{participant.role}</p>
            </div>
            <div className="w-2 h-2 bg-green-500 rounded-full" title="Online" />
          </div>
        ))}
      </div>
    </div>
  );
};

export default ParticipantsTab;

