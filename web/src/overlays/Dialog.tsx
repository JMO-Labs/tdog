import { Modal, type ModalProps } from "./Modal";

export function Dialog(props: ModalProps) {
  return <Modal {...props} className="dialog" />;
}
