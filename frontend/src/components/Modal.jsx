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
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [...ref.current.querySelectorAll(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        )].filter((element) => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (!first) { event.preventDefault(); ref.current.focus(); return; }
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
