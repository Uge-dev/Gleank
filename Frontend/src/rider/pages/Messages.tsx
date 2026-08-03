import { MessageWorkspace } from '../../pages/Messages';
import { useAuth } from '../context/AuthContext';

export default function RiderMessages() {
  const { rider, loading } = useAuth();

  return (
    <section className="rider-message-workspace">
      <MessageWorkspace
        currentUserId={rider?.id}
        authReady={!loading}
        authenticated={Boolean(rider)}
        portal="rider"
        messagesPath="/rider/messages"
      />
    </section>
  );
}
