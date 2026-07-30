import RiderApp from "./App";
import { AuthProvider as RiderAuthProvider } from "./context/AuthContext";
import { RiderDataProvider } from "./context/RiderDataContext";
import "./styles/index.css";

export default function RiderModule() {
  return (
    <div className="rider-root">
      <RiderAuthProvider>
        <RiderDataProvider>
          <RiderApp />
        </RiderDataProvider>
      </RiderAuthProvider>
    </div>
  );
}
