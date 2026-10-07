import { useEffect, useRef } from "react";

// Native modal dialogs provide focus containment and make the background inert.
export default function Modal({ label, onClose, children, className = "" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      id={className === "mobile-more" ? "mobile-more" : undefined}
      className={`app-modal ${className}`}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
