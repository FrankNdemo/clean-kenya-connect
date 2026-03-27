from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm

from .models import (
    Authority,
    Collector,
    CollectionRequest,
    CollectionRequestUpdate,
    Complaint,
    Event,
    EventParticipant,
    GreenCredit,
    Household,
    IllegalDumping,
    PriceOffer,
    RecyclableListing,
    Recycler,
    RecyclerTransaction,
    SuspendedUser,
    User,
    WasteType,
    CollectorTransaction,
)


class CustomUserCreationForm(UserCreationForm):
    class Meta(UserCreationForm.Meta):
        model = User
        fields = (
            "username",
            "email",
            "first_name",
            "last_name",
            "user_type",
            "phone",
            "is_staff",
            "is_superuser",
            "is_active",
        )


class CustomUserChangeForm(UserChangeForm):
    class Meta(UserChangeForm.Meta):
        model = User
        fields = "__all__"


@admin.register(User)
class CustomUserAdmin(DjangoUserAdmin):
    form = CustomUserChangeForm
    add_form = CustomUserCreationForm

    list_display = (
        "username",
        "email",
        "user_type",
        "phone",
        "is_staff",
        "is_superuser",
        "is_active",
    )
    list_filter = ("user_type", "is_staff", "is_superuser", "is_active", "groups")
    search_fields = ("username", "email", "phone", "first_name", "last_name")
    ordering = ("username",)
    readonly_fields = ("last_login", "date_joined")

    fieldsets = (
        (None, {"fields": ("username", "password")}),
        (
            "Personal info",
            {"fields": ("first_name", "last_name", "email", "phone", "user_type")},
        ),
        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            },
        ),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )

    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": (
                    "username",
                    "email",
                    "first_name",
                    "last_name",
                    "user_type",
                    "phone",
                    "is_staff",
                    "is_superuser",
                    "is_active",
                    "password1",
                    "password2",
                ),
            },
        ),
    )


for model in (
    Household,
    Collector,
    Recycler,
    Authority,
    WasteType,
    CollectionRequest,
    CollectionRequestUpdate,
    Event,
    EventParticipant,
    IllegalDumping,
    GreenCredit,
    Complaint,
    SuspendedUser,
    RecyclableListing,
    PriceOffer,
    RecyclerTransaction,
    CollectorTransaction,
):
    admin.site.register(model)

