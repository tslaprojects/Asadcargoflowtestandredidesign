import 'package:cargoflow_core/cargoflow_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:provider/provider.dart';

import 'screens/history.dart';
import 'screens/profile.dart';
import 'screens/trip.dart';
import 'services/location.dart';
import 'services/outbox.dart';

/// CargoFlow Водитель — нативное приложение для iOS и Android: текущий рейс, этапы,
/// автоматическая передача местоположения, фото груза / пломбы / CMR, офлайн-очередь отметок.
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await initializeDateFormatting('ru');
  final tokens = SecureTokenStore();
  final api = ApiClient(baseUrl: SessionController.defaultServer, tokens: tokens);
  final session = SessionController(api: api, tokens: tokens);
  final outbox = Outbox(api);
  final location = LocationService(outbox);
  await Future.wait([outbox.load(), location.loadPreference()]);
  outbox.start();
  session.restore();
  runApp(DriverApp(session: session, outbox: outbox, location: location));
}

class DriverApp extends StatelessWidget {
  const DriverApp({super.key, required this.session, required this.outbox, required this.location});
  final SessionController session;
  final Outbox outbox;
  final LocationService location;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider.value(value: session),
        Provider.value(value: session.api),
        ChangeNotifierProvider.value(value: outbox),
        ChangeNotifierProvider.value(value: location),
      ],
      child: MaterialApp(
        title: 'CargoFlow Водитель',
        debugShowCheckedModeBanner: false,
        theme: cargoflowTheme(),
        locale: const Locale('ru'),
        supportedLocales: const [Locale('ru')],
        localizationsDelegates: GlobalMaterialLocalizations.delegates,
        home: const DriverGate(),
      ),
    );
  }
}

class DriverGate extends StatelessWidget {
  const DriverGate({super.key});

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
            appTitle: 'CargoFlow Водитель',
            appSubtitle: 'Рейс, этапы, местоположение и документы — в одном приложении',
          ),
        SessionStatus.signedIn => session.actor!.workspace == Workspace.driver
            ? DriverHome(key: ValueKey('home-${session.actor!.userId}-${session.actor!.dataMode}'))
            : Scaffold(
                key: const ValueKey('not-driver'),
                body: EmptyView(
                  icon: Icons.badge_outlined,
                  title: 'Приложение для водителей',
                  text: 'Эта учётная запись не водитель. Грузовладельцам, перевозчикам и экспедиторам — приложение «CargoFlow».',
                  action: 'Выйти',
                  onAction: session.logout,
                ),
              ),
      },
    );
  }
}

class DriverHome extends StatefulWidget {
  const DriverHome({super.key});

  @override
  State<DriverHome> createState() => _DriverHomeState();
}

class _DriverHomeState extends State<DriverHome> with WidgetsBindingObserver {
  int _tab = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Вернулись в приложение — сразу пробуем отправить накопленные отметки
    if (state == AppLifecycleState.resumed) context.read<Outbox>().flush();
  }

  @override
  Widget build(BuildContext context) {
    final demo = context.select<SessionController, bool>((s) => s.actor?.demo ?? false);
    final pending = context.select<Outbox, int>((o) => o.length);
    return Scaffold(
      body: Column(children: [
        if (demo)
          Container(
            width: double.infinity,
            color: CF.warningBg,
            padding: EdgeInsets.fromLTRB(16, MediaQuery.paddingOf(context).top + 4, 16, 4),
            child: const Text('Демо-база: учебные данные', style: TextStyle(color: CF.warning, fontSize: 12, fontWeight: FontWeight.w600)),
          ),
        Expanded(
          child: MediaQuery.removePadding(
            context: context,
            removeTop: demo,
            child: IndexedStack(index: _tab, children: const [TripScreen(), HistoryScreen(), ProfileScreen()]),
          ),
        ),
      ]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.local_shipping_outlined), selectedIcon: Icon(Icons.local_shipping), label: 'Рейс'),
          const NavigationDestination(icon: Icon(Icons.history), label: 'История'),
          NavigationDestination(
            icon: Badge(isLabelVisible: pending > 0, label: Text('$pending'), child: const Icon(Icons.person_outline)),
            selectedIcon: const Icon(Icons.person),
            label: 'Профиль',
          ),
        ],
      ),
    );
  }
}
