import { MessageWorkspace } from '../../pages/Messages';
import { useAuth } from '../context/AuthContext';

export default function RiderMessages() {
  const { rider } = useAuth();

  return (
    <section className="rider-message-workspace">
      <MessageWorkspace
        currentUserId={rider?.id}
        portal="rider"
        messagesPath="/rider/messages"
      />
    </section>
  );
}
