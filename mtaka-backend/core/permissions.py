from rest_framework import permissions


class IsResident(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'resident'

class IsCollector(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'collector'

class IsRecycler(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'recycler'

class IsAuthority(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'authority'



class IsRole(permissions.BasePermission):
    """
    Usage:
    permission_classes = [IsRole(['collector', 'recycler'])]
    """
    def __init__(self, roles):
        self.roles = roles

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in self.roles
