import 'package:flutter/material.dart';

import '../domain/statuses.dart';
import '../models/operations.dart';
import '../theme/tokens.dart';

/// Статус как короткая плашка: тон + текст (цвет никогда не единственный носитель смысла).
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.label, required this.tone, this.icon});

  factory StatusChip.order(String status) => StatusChip(label: statusLabel(status), tone: statusTone(status));
  factory StatusChip.health(Health h) => StatusChip(label: CF.healthLabel(h), tone: CF.healthTone(h), icon: _healthIcon(h));

  final String label;
  final Tone tone;
  final IconData? icon;

  static IconData _healthIcon(Health h) => switch (h) {
        Health.moving => Icons.navigation_outlined,
        Health.arriving => Icons.timer_outlined,
        Health.delayed => Icons.warning_amber_rounded,
        Health.waiting => Icons.schedule,
        Health.attention => Icons.pause_circle_outline,
        Health.done => Icons.check_circle_outline,
        Health.cancelled => Icons.block,
      };

  @override
  Widget build(BuildContext context) {
    final (fg, bg) = CF.tone(tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(CF.radiusSm), border: Border.all(color: fg.withValues(alpha: 0.22))),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 13, color: fg), const SizedBox(width: 4)],
        Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w500)),
      ]),
    );
  }
}

class HealthDot extends StatelessWidget {
  const HealthDot(this.health, {super.key, this.size = 8});
  final Health health;
  final double size;
  @override
  Widget build(BuildContext context) => Container(width: size, height: size, decoration: BoxDecoration(color: CF.healthColor(health), shape: BoxShape.circle));
}

/// Режим данных в шапке: 🧪 Демо — предупреждающий тон, Реальная — нейтральный.
class ModeBadge extends StatelessWidget {
  const ModeBadge({super.key, required this.demo, this.onTap});
  final bool demo;
  final VoidCallback? onTap;
  @override
  Widget build(BuildContext context) {
    final fg = demo ? CF.warning : CF.neutral;
    final bg = demo ? CF.warningBg : CF.neutralBg;
    return Semantics(
      button: onTap != null,
      label: 'Режим данных: ${demo ? 'демо-база' : 'реальная база'}',
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(CF.radiusSm),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(CF.radiusSm), border: Border.all(color: fg.withValues(alpha: 0.25))),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(demo ? Icons.science_outlined : Icons.storage_outlined, size: 14, color: fg),
            const SizedBox(width: 4),
            Text(demo ? 'Демо' : 'Реальная', style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
          ]),
        ),
      ),
    );
  }
}

/// Пустое состояние: что здесь появится и какое следующее действие.
class EmptyView extends StatelessWidget {
  const EmptyView({super.key, required this.icon, required this.title, required this.text, this.action, this.onAction});
  final IconData icon;
  final String title;
  final String text;
  final String? action;
  final VoidCallback? onAction;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(color: CF.accent, borderRadius: BorderRadius.circular(CF.radiusLg)),
              child: Icon(icon, color: CF.primary),
            ),
            const SizedBox(height: 12),
            Text(title, style: Theme.of(context).textTheme.titleMedium, textAlign: TextAlign.center),
            const SizedBox(height: 4),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 360),
              child: Text(text, textAlign: TextAlign.center, style: const TextStyle(color: CF.mutedForeground)),
            ),
            if (action != null) ...[const SizedBox(height: 16), FilledButton(onPressed: onAction, child: Text(action!))],
          ]),
        ),
      );
}

/// Ошибка загрузки: понятное сообщение и повтор.
class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, required this.onRetry, this.title = 'Не удалось загрузить данные'});
  final String title;
  final String message;
  final VoidCallback onRetry;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.error_outline, color: CF.danger, size: 28),
            const SizedBox(height: 8),
            Text(title, style: const TextStyle(color: CF.danger, fontWeight: FontWeight.w600, fontSize: 15)),
            const SizedBox(height: 4),
            Text(message, textAlign: TextAlign.center, style: const TextStyle(color: CF.mutedForeground)),
            const SizedBox(height: 16),
            OutlinedButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh, size: 18), label: const Text('Повторить')),
          ]),
        ),
      );
}

/// Скелетон списка (вместо «Загрузка...»): мерцающие строки той же формы.
class ListSkeleton extends StatefulWidget {
  const ListSkeleton({super.key, this.rows = 6});
  final int rows;
  @override
  State<ListSkeleton> createState() => _ListSkeletonState();
}

class _ListSkeletonState extends State<ListSkeleton> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1200))..repeat(reverse: true);
  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    Widget bar(double w, double h) => AnimatedBuilder(
          animation: _c,
          builder: (_, _) => Container(
            width: w,
            height: h,
            decoration: BoxDecoration(
              color: Color.lerp(CF.muted, CF.border, reduce ? 0.3 : _c.value),
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        );
    return Semantics(
      label: 'Загрузка',
      child: ListView.separated(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        itemCount: widget.rows,
        separatorBuilder: (_, _) => const Divider(),
        itemBuilder: (_, _) => Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [bar(90, 10), const SizedBox(height: 8), bar(220, 14), const SizedBox(height: 6), bar(160, 10)]),
        ),
      ),
    );
  }
}

/// Подпись секции (overline).
class Overline extends StatelessWidget {
  const Overline(this.text, {super.key});
  final String text;
  @override
  Widget build(BuildContext context) => Text(text.toUpperCase(), style: Theme.of(context).textTheme.labelSmall);
}
