import { Modal, type ModalProps } from "./Modal";

/** Right-hand drawer. */
export function Sheet(props: ModalProps) {
  return <Modal {...props} className="dialog sheet" sheet />;
}
