import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import '../domain/statuses.dart';
import '../models/operations.dart';

/// Токены дизайн-системы CargoFlow (src/app/globals.css) — Transportation OS.
abstract final class CF {
  static const background = Color(0xFFF2F4F7);
  static const foreground = Color(0xFF0B1220);
  static const card = Color(0xFFFFFFFF);
  static const surface2 = Color(0xFFF7F8FA);
  static const muted = Color(0xFFEEF0F4);
  static const mutedForeground = Color(0xFF556070);
  static const border = Color(0xFFE2E6EC);
  static const borderStrong = Color(0xFFCDD3DC);
  static const primary = Color(0xFF1D4ED8);
  static const primaryHover = Color(0xFF1E40AF);
  static const accent = Color(0xFFEAF1FF);
  static const sidebar = Color(0xFF0E131C);
  static const sidebarForeground = Color(0xFFC3CAD6);
  static const sidebarMuted = Color(0xFF8A94A6);
  static const sidebarActive = Color(0xFF1D2533);
  static const sidebarAccent = Color(0xFF5B8CFF);

  static const success = Color(0xFF15803D);
  static const successBg = Color(0xFFEBFAF0);
  static const warning = Color(0xFFA65200);
  static const warningBg = Color(0xFFFFF7E6);
  static const info = Color(0xFF1D4ED8);
  static const infoBg = Color(0xFFEDF3FF);
  static const delayed = Color(0xFFC2410C);
  static const delayedBg = Color(0xFFFFF2EA);
  static const danger = Color(0xFFB91C1C);
  static const dangerBg = Color(0xFFFEF1F1);
  static const neutral = Color(0xFF4A5565);
  static const neutralBg = Color(0xFFF0F2F5);

  static const radiusSm = 5.0;
  static const radiusMd = 7.0;
  static const radiusLg = 9.0;
  static const radiusXl = 11.0;

  static const fast = Duration(milliseconds: 120);
  static const standard = Duration(milliseconds: 200);
  static const complex = Duration(milliseconds: 320);
  static const easeOut = Cubic(0.22, 1, 0.36, 1);

  static Color healthColor(Health h) => switch (h) {
        Health.moving => const Color(0xFF1D4ED8),
        Health.arriving => const Color(0xFF0E7490),
        Health.delayed => const Color(0xFFEA580C),
        Health.waiting => const Color(0xFFD97706),
        Health.attention => const Color(0xFFDC2626),
        Health.done => const Color(0xFF16A34A),
        Health.cancelled => const Color(0xFF64748B),
      };

  static String healthLabel(Health h) => switch (h) {
        Health.moving => 'В движении',
        Health.arriving => 'Прибывает',
        Health.delayed => 'Опаздывает',
        Health.waiting => 'Ожидание',
        Health.attention => 'Требует внимания',
        Health.done => 'Доставлено',
        Health.cancelled => 'Отменено',
      };

  static Tone healthTone(Health h) => switch (h) {
        Health.moving || Health.arriving => Tone.info,
        Health.delayed => Tone.delayed,
        Health.waiting => Tone.warning,
        Health.attention => Tone.danger,
        Health.done => Tone.success,
        Health.cancelled => Tone.neutral,
      };

  static (Color fg, Color bg) tone(Tone t) => switch (t) {
        Tone.info => (info, infoBg),
        Tone.warning => (warning, warningBg),
        Tone.success => (success, successBg),
        Tone.danger => (danger, dangerBg),
        Tone.neutral => (neutral, neutralBg),
        Tone.delayed => (delayed, delayedBg),
      };
}

/// Тема приложений: светлое рабочее пространство, тонкие границы, умеренные радиусы, системный шрифт платформы.
ThemeData cargoflowTheme() {
  final scheme = ColorScheme.fromSeed(seedColor: CF.primary, brightness: Brightness.light).copyWith(
    primary: CF.primary,
    onPrimary: Colors.white,
    surface: CF.card,
    onSurface: CF.foreground,
    outline: CF.borderStrong,
    outlineVariant: CF.border,
    error: CF.danger,
  );
  final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: CF.background, visualDensity: VisualDensity.standard);
  final border = OutlineInputBorder(borderRadius: BorderRadius.circular(CF.radiusMd), borderSide: const BorderSide(color: Color(0xFF838FA1)));
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: CF.foreground, displayColor: CF.foreground).copyWith(
          headlineSmall: base.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.4, color: CF.foreground),
          titleLarge: base.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700, letterSpacing: -0.3, fontSize: 20),
          titleMedium: base.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w600, fontSize: 15),
          bodyMedium: base.textTheme.bodyMedium?.copyWith(fontSize: 14, height: 1.4),
          bodySmall: base.textTheme.bodySmall?.copyWith(fontSize: 12, color: CF.mutedForeground),
          labelSmall: base.textTheme.labelSmall?.copyWith(fontSize: 11, fontWeight: FontWeight.w600, letterSpacing: 0.6, color: CF.mutedForeground),
        ),
    appBarTheme: const AppBarTheme(
      backgroundColor: CF.card,
      foregroundColor: CF.foreground,
      elevation: 0,
      scrolledUnderElevation: 0.5,
      surfaceTintColor: Colors.transparent,
      centerTitle: false,
      titleTextStyle: TextStyle(fontSize: 17, fontWeight: FontWeight.w600, color: CF.foreground),
    ),
    cardTheme: CardThemeData(
      color: CF.card,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(CF.radiusLg), side: const BorderSide(color: CF.border)),
    ),
    dividerTheme: const DividerThemeData(color: CF.border, space: 1, thickness: 1),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: CF.card,
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      border: border,
      enabledBorder: border,
      focusedBorder: border.copyWith(borderSide: const BorderSide(color: CF.primary, width: 2)),
      errorBorder: border.copyWith(borderSide: const BorderSide(color: CF.danger)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        backgroundColor: CF.primary,
        minimumSize: const Size(44, 44),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(CF.radiusMd)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: CF.foreground,
        minimumSize: const Size(44, 44),
        side: const BorderSide(color: CF.borderStrong),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(CF.radiusMd)),
      ),
    ),
    navigationBarTheme: const NavigationBarThemeData(backgroundColor: CF.card, indicatorColor: CF.accent, elevation: 0, height: 64),
    navigationRailTheme: const NavigationRailThemeData(
      backgroundColor: CF.sidebar,
      indicatorColor: CF.sidebarActive,
      selectedIconTheme: IconThemeData(color: Colors.white),
      unselectedIconTheme: IconThemeData(color: CF.sidebarForeground),
      selectedLabelTextStyle: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
      unselectedLabelTextStyle: TextStyle(color: CF.sidebarForeground, fontSize: 11),
    ),
    snackBarTheme: const SnackBarThemeData(behavior: SnackBarBehavior.floating, backgroundColor: CF.foreground),
    pageTransitionsTheme: const PageTransitionsTheme(builders: {
      TargetPlatform.android: FadeForwardsPageTransitionsBuilder(),
      TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      TargetPlatform.macOS: CupertinoPageTransitionsBuilder(),
      TargetPlatform.windows: FadeForwardsPageTransitionsBuilder(),
    }),
  );
}
