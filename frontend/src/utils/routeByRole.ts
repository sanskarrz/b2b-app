// Central place that decides which home a logged-in user lands on, based on role.
import { Router } from "expo-router";

export function routeByRole(router: Router, me: any) {
  const role = me?.role || "pharmacist";
  if (role === "owner" || role === "manager") {
    router.replace("/d/home");
  } else if (role === "field_sales") {
    router.replace("/field/home");
  } else if (role === "delivery") {
    router.replace("/delivery/home");
  } else if (!me?.onboarded) {
    router.replace("/auth/onboarding");
  } else {
    router.replace("/(tabs)/home");
  }
}
