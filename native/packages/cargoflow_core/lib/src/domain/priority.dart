/// Приоритет события в центре уведомлений (порт lib/notification-priority.ts).
enum EventPriority { critical, action, info }

const _critical = {'DISPUTE_CREATED', 'DISPUTE_UPDATED', 'FUEL_ANOMALY'};
const _action = {'NEW_BID', 'BID_COUNTERED', 'CONTRACT_READY', 'LOAD_QUESTION', 'NEW_DOCUMENT', 'VERIFICATION_UPDATED'};
// Начало слова: «транспорт» не должен совпадать со «спор»
final _urgent = RegExp(r'(?:^|[^а-яё])(?:задерж|опазд|просроч|не удал|ошибк|отклон|спор|истека)', caseSensitive: false, unicode: true);
final _actionWords = RegExp(r'(?:^|[^а-яё])(?:подтверд|подпиш|требует|выберите|ожидает вашего)', caseSensitive: false, unicode: true);

EventPriority eventPriority(String type, String title, [String? body]) {
  final text = '$title ${body ?? ''}';
  if (_critical.contains(type) || _urgent.hasMatch(text)) return EventPriority.critical;
  if (type == 'PAYMENT_UPDATED' && RegExp(r'не прош|ошибк|возврат', caseSensitive: false).hasMatch(text)) return EventPriority.critical;
  if (_action.contains(type) || _actionWords.hasMatch(text)) return EventPriority.action;
  return EventPriority.info;
}
