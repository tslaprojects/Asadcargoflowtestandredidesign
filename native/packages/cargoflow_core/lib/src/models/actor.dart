/// Пользователь и его активная компания (ответ /api/auth/me).
class Membership {
  Membership({required this.companyId, required this.role, required this.companyName, required this.companyType});

  final String companyId;
  final String role;
  final String companyName;
  final String companyType;

  factory Membership.fromJson(Map<String, dynamic> j) {
    final c = j['company'] as Map<String, dynamic>;
    return Membership(companyId: j['companyId'] as String, role: j['role'] as String, companyName: c['legalName'] as String, companyType: c['type'] as String);
  }
}

/// Тип рабочего пространства по роли (как навигация веб-версии).
enum Workspace { customer, forwarder, carrier, driver, admin, none }

class Actor {
  Actor({
    required this.userId,
    required this.email,
    required this.fullName,
    required this.isAdmin,
    required this.dataMode,
    required this.memberships,
    required this.active,
    required this.permissions,
  });

  final String userId;
  final String email;
  final String fullName;
  final bool isAdmin;
  final String dataMode;
  final List<Membership> memberships;
  final Membership? active;
  final Set<String> permissions;

  bool get demo => dataMode == 'demo';
  bool can(String permission) => permissions.contains(permission);

  String get initials {
    final parts = fullName.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).take(2);
    return parts.map((p) => p[0].toUpperCase()).join();
  }

  Workspace get workspace {
    final r = active?.role;
    if (r == null) return isAdmin ? Workspace.admin : Workspace.none;
    if (r == 'FORWARDER') return Workspace.forwarder;
    if (r == 'SHIPPER') return Workspace.customer;
    if (r == 'CARRIER_ADMIN' || r == 'CARRIER_DISPATCHER') return Workspace.carrier;
    return Workspace.driver;
  }

  factory Actor.fromJson(Map<String, dynamic> j) {
    final active = j['active'];
    return Actor(
      userId: j['userId'] as String,
      email: j['email'] as String,
      fullName: j['fullName'] as String,
      isAdmin: j['isAdmin'] as bool? ?? false,
      dataMode: j['dataMode'] as String? ?? 'real',
      memberships: ((j['memberships'] as List?) ?? []).map((m) => Membership.fromJson(m as Map<String, dynamic>)).toList(),
      active: active is Map<String, dynamic> ? Membership.fromJson(active) : null,
      permissions: ((j['permissions'] as List?) ?? []).map((e) => '$e').toSet(),
    );
  }
}
