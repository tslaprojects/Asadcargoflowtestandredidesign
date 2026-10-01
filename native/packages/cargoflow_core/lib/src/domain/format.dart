import 'package:intl/intl.dart';

/// Форматирование для интерфейса (русский язык, местное время устройства).
abstract final class Fmt {
  static String date(DateTime? d) => d == null ? '—' : DateFormat('dd.MM.yyyy', 'ru').format(d);
  static String short(DateTime? d) => d == null ? '—' : DateFormat('d MMM', 'ru').format(d);
  static String dateTime(DateTime? d) => d == null ? '—' : DateFormat('dd.MM.yyyy, HH:mm', 'ru').format(d);
  static String time(DateTime? d) => d == null ? '—' : DateFormat('HH:mm', 'ru').format(d);

  static String relative(DateTime? d, [DateTime? now]) {
    if (d == null) return '—';
    final diff = (now ?? DateTime.now()).difference(d);
    final future = diff.isNegative;
    final s = diff.inSeconds.abs();
    String unit(int n, String one, String few, String many) {
      final m10 = n % 10, m100 = n % 100;
      final w = m10 == 1 && m100 != 11 ? one : (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? few : many);
      return '$n $w';
    }

    String v;
    if (s < 60) {
      return 'только что';
    } else if (s < 3600) {
      v = unit(s ~/ 60, 'минуту', 'минуты', 'минут');
    } else if (s < 86400) {
      v = unit(s ~/ 3600, 'час', 'часа', 'часов');
    } else if (s < 86400 * 30) {
      v = unit(s ~/ 86400, 'день', 'дня', 'дней');
    } else {
      return date(d);
    }
    return future ? 'через $v' : '$v назад';
  }

  static String money(double? amount, String? currency) {
    if (amount == null) return '—';
    final n = NumberFormat.decimalPattern('ru').format(amount.round());
    final sym = switch (currency) { 'USD' => '\$', 'EUR' => '€', 'RUB' => '₽', 'KZT' => '₸', 'CNY' => '¥', _ => currency ?? '' };
    return '$n $sym';
  }

  static String weight(double? kg) {
    if (kg == null) return '—';
    if (kg >= 1000) return '${NumberFormat('#,##0.#', 'ru').format(kg / 1000)} т';
    return '${NumberFormat.decimalPattern('ru').format(kg.round())} кг';
  }
}
