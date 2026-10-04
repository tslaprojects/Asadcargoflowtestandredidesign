import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'shell.dart';

/// CargoFlow — нативное приложение Transportation OS для грузовладельцев, перевозчиков и экспедиторов
/// (Windows, macOS, iOS, Android). Работает с тем же API, что и веб-версия.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  final tokens = SecureTokenStore();
  final api = ApiClient(baseUrl: SessionController.defaultServer, tokens: tokens);
  final session = SessionController(api: api, tokens: tokens);
  session.restore();
  runApp(CargoFlowApp(session: session));
}

class CargoFlowApp extends StatelessWidget {
  const CargoFlowApp({super.key, required this.session});
  final SessionController session;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: session),
        Provider.value(value: session.api),
      ],
      child: MaterialApp(
        title: 'CargoFlow',
        debugShowCheckedModeBanner: false,
        theme: cargoflowTheme(),
        locale: const Locale('ru'),
        supportedLocales: const [Locale('ru')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: const AuthGate(),
      ),
    );
  }
}

/// Вход → рабочее пространство по роли.
class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    final session = context.watch<SessionController>();
    return AnimatedSwitcher(
      duration: CF.complex,
      child: switch (session.status) {
        SessionStatus.restoring => const Scaffold(key: ValueKey('restoring'), body: Center(child: CircularProgressIndicator())),
        SessionStatus.signedOut => LoginScreen(
            key: const ValueKey('login'),
            session: session,
            appTitle: 'CargoFlow',
            appSubtitle: 'Центр управления перевозками: грузовладельцы, перевозчики, экспедиторы',
          ),
        SessionStatus.signedIn => _workspaceFor(session.actor!),
      },
    );
  }

  Widget _workspaceFor(Actor actor) {
    switch (actor.workspace) {
      case Workspace.driver:
        return const _Redirect(
          icon: Icons.phone_iphone,
          title: 'Для водителей — приложение «CargoFlow Водитель»',
          text: 'Рейс, этапы, местоположение, фото и документы — в отдельном мобильном приложении для iOS и Android.',
        );
      case Workspace.admin:
        return const _Redirect(
          icon: Icons.admin_panel_settings_outlined,
          title: 'Администрирование — в веб-версии',
          text: 'Панель администратора платформы доступна в браузере. Это приложение — для компаний-участников перевозок.',
        );
      case Workspace.none:
        return const _Redirect(
          icon: Icons.domain_add_outlined,
          title: 'Создайте компанию',
          text: 'У учётной записи пока нет компании. Зарегистрируйте компанию в веб-версии CargoFlow, затем войдите снова.',
        );
      default:
        return Shell(key: ValueKey('shell-${actor.userId}-${actor.dataMode}'), actor: actor);
    }
  }
}

class _Redirect extends StatelessWidget {
  const _Redirect({required this.icon, required this.title, required this.text});
  final IconData icon;
  final String title;
  final String text;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: EmptyView(icon: icon, title: title, text: text, action: 'Выйти', onAction: () => context.read<SessionController>().logout()),
      );
}
