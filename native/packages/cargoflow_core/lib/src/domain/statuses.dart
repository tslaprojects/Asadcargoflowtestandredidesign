/// Статусы перевозки и подписи — как в веб-версии (src/lib/state-machine/order-state-machine.ts).
const orderStatusLabels = <String, String>{
  'DRAFT': 'Черновик',
  'PUBLISHED': 'Опубликован',
  'CARRIER_SELECTION': 'Выбор перевозчика',
  'CARRIER_SELECTED': 'Перевозчик выбран',
  'CONTRACT_PENDING': 'Ожидает подписания',
  'CONTRACT_SIGNED': 'Договор подписан',
  'VEHICLE_ASSIGNED': 'Автомобиль назначен',
  'DRIVER_ASSIGNED': 'Водитель назначен',
  'WAITING_FOR_LOADING': 'Ожидает загрузки',
  'AT_LOADING': 'На загрузке',
  'LOADED': 'Загружено',
  'IN_TRANSIT': 'В пути',
  'AT_BORDER': 'На границе',
  'CUSTOMS': 'Таможня',
  'BORDER_CLEARED': 'Граница пройдена',
  'AT_DELIVERY': 'На разгрузке',
  'DELIVERED': 'Доставлено',
  'CLOSED': 'Закрыто',
  'CANCELLED': 'Отменено',
  'DISPUTED': 'Спор',
  'ON_HOLD': 'Приостановлено',
};

String statusLabel(String status) => orderStatusLabels[status] ?? status;

/// Тон статуса: info — в процессе, warning — требуется действие, success — закрыто, danger — спор/отмена, neutral — не начато.
enum Tone { info, warning, success, danger, neutral, delayed }

Tone statusTone(String status) {
  switch (status) {
    case 'CONTRACT_PENDING':
    case 'CONTRACT_SIGNED':
    case 'VEHICLE_ASSIGNED':
    case 'DELIVERED':
    case 'CARRIER_SELECTION':
      return Tone.warning;
    case 'CLOSED':
      return Tone.success;
    case 'CANCELLED':
    case 'DISPUTED':
    case 'ON_HOLD':
      return Tone.danger;
    case 'DRAFT':
      return Tone.neutral;
    default:
      return Tone.info;
  }
}

/// Основной путь статусов (для этапов и прогресса).
const statusOrder = [
  'CARRIER_SELECTED',
  'CONTRACT_PENDING',
  'CONTRACT_SIGNED',
  'VEHICLE_ASSIGNED',
  'DRIVER_ASSIGNED',
  'WAITING_FOR_LOADING',
  'AT_LOADING',
  'LOADED',
  'IN_TRANSIT',
  'AT_BORDER',
  'CUSTOMS',
  'BORDER_CLEARED',
  'AT_DELIVERY',
  'DELIVERED',
  'CLOSED',
];

const documentTypeLabels = <String, String>{
  'APPLICATION': 'Заявка',
  'CMR': 'CMR',
  'INVOICE': 'Счёт / инвойс',
  'PACKING_LIST': 'Упаковочный лист',
  'VEHICLE_DOCUMENT': 'Документ ТС',
  'DRIVER_DOCUMENT': 'Документ водителя',
  'CARGO_PHOTO': 'Фото груза',
  'SEAL_PHOTO': 'Фото пломбы',
  'PROOF_OF_DELIVERY': 'Подтверждение доставки (POD)',
  'OTHER': 'Другое',
  'CONTRACT': 'Договор',
};

String documentLabel(String type) => documentTypeLabels[type] ?? type;
