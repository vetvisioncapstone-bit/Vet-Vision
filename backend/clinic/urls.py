from django.urls import path

from .views import (
    BranchList, ConsultationCreate, ConsultationDetail,
    ServiceCatalog, ServiceDetailView, MyPets, MyReminders, PatientDetail, PatientList, StaffDetail, StaffList,
)

urlpatterns = [
    path("me/pets/", MyPets.as_view()),
    path("me/reminders/", MyReminders.as_view()),
    path("branches/", BranchList.as_view()),
    path("patients/", PatientList.as_view()),
    path("patients/<str:pk>/", PatientDetail.as_view()),
    path("patients/<str:pk>/consultations/", ConsultationCreate.as_view()),
    path("consultations/<str:pk>/", ConsultationDetail.as_view()),
    path("services/", ServiceCatalog.as_view()),
    path("services/<str:pk>/", ServiceDetailView.as_view()),
    path("staff-accounts/", StaffList.as_view()),
    path("staff-accounts/<str:pk>/", StaffDetail.as_view()),
]
