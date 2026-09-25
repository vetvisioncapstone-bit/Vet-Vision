from django.urls import path

from .views import (
    ApproveRequest, AvailabilityView, ClinicCalendar, DenyRequest, DismissRequest, EventPostDetail, EventPostList,
    RequestList, SeenFollowUps,
)

urlpatterns = [
    path("events/posts/", EventPostList.as_view()),
    path("events/posts/<int:pk>/", EventPostDetail.as_view()),
    path("events/availability/", AvailabilityView.as_view()),
    path("clinic/calendar/", ClinicCalendar.as_view()),
    path("requests/", RequestList.as_view()),
    path("requests/<int:pk>/approve/", ApproveRequest.as_view()),
    path("requests/<int:pk>/deny/", DenyRequest.as_view()),
    path("requests/<int:pk>/dismiss/", DismissRequest.as_view()),
    path("seen-followups/", SeenFollowUps.as_view()),
]
